import { app, BrowserWindow, ipcMain, screen, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { watch } from 'chokidar'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { Status, MultiSessionStatus, UsageInfo, SessionSource } from '../shared/types'
import { startDevCodexWatcher, stopDevCodexWatcher } from './codex-watcher'
import { createStatusUpdateCoalescer } from './status-update-coalescer'
import { buildMultiSessionStatus, legacyToMultiSession, normalizeLegacyStatus, type SessionsFileFormat } from './status-state'
import { getStatusWatchOptions } from './status-watch-options'

const STATUS_DIR = join(homedir(), '.agent-paperclip')
const STATUS_FILE = join(STATUS_DIR, 'status.json')
const SESSIONS_FILE = join(STATUS_DIR, 'sessions.json')
const SETTINGS_FILE = join(STATUS_DIR, 'settings.json')
const USAGE_FILE = join(STATUS_DIR, 'usage.json')
const debug = !!process.env.COMPANION_DEBUG
const STATUS_WATCH_DEBOUNCE_MS = 75
const USAGE_STALE_AFTER_SECONDS = 6 * 60 * 60

let mainWindow: BrowserWindow | null = null

// Sticker pack definitions (id and name only - renderer has the actual assets)
const STICKER_PACKS = [
  { id: 'bot1', name: 'Bot1' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'gandalf', name: 'Gandalf' },
  { id: 'paperclip', name: 'Paperclip' },
  { id: 'svg', name: 'SVG' }
]

let activePack = 'paperclip'
let soundEnabled = true

async function ensureStatusDir(): Promise<void> {
  if (!existsSync(STATUS_DIR)) {
    await mkdir(STATUS_DIR, { recursive: true })
  }
}

async function readLegacyStatus(): Promise<Status> {
  try {
    const content = await readFile(STATUS_FILE, 'utf-8')
    const status = JSON.parse(content) as Status
    return normalizeLegacyStatus(status)
  } catch {
    return { status: 'idle', action: 'Waiting for Agent...', timestamp: Date.now() }
  }
}

async function readMultiSessionStatus(): Promise<MultiSessionStatus> {
  try {
    const content = await readFile(SESSIONS_FILE, 'utf-8')
    const parsed = JSON.parse(content) as SessionsFileFormat
    if (debug) console.log(`[status-reader] loaded ${SESSIONS_FILE}`)
    const result = buildMultiSessionStatus(parsed)
    if (debug) console.log(`[status-reader] parsed ${Object.keys(parsed.sessions).length} sessions, ${result.sessions.length} active after stale filtering`)
    // If all sessions are stale, check legacy status.json too
    if (result.sessions.length === 0) {
      if (debug) console.log('[status-reader] no active sessions, falling back to legacy status.json')
      return legacyToMultiSession(await readLegacyStatus())
    }
    return result
  } catch {
    if (debug) console.log('[status-reader] sessions.json unavailable, falling back to legacy status.json')
    // Fall back to legacy status.json
    return legacyToMultiSession(await readLegacyStatus())
  }
}

async function readUsage(): Promise<UsageInfo | null> {
  try {
    const content = await readFile(USAGE_FILE, 'utf-8')
    const parsed = JSON.parse(content) as Partial<UsageInfo>
    if (
      typeof parsed.usedPercentage !== 'number' ||
      typeof parsed.resetsAt !== 'number' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null
    }
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (nowSeconds - parsed.updatedAt > USAGE_STALE_AFTER_SECONDS) {
      return null
    }
    // Older files on disk (pre-Codex-usage) have no source; default to Claude.
    const source: SessionSource = parsed.source === 'codex' ? 'codex' : 'claude-code'
    return {
      source,
      usedPercentage: parsed.usedPercentage,
      resetsAt: parsed.resetsAt,
      updatedAt: parsed.updatedAt
    }
  } catch {
    return null
  }
}

interface Settings {
  activePack: string
  soundEnabled: boolean
}

async function loadSettings(): Promise<void> {
  try {
    const content = await readFile(SETTINGS_FILE, 'utf-8')
    const settings: Settings = JSON.parse(content)
    if (settings.activePack && STICKER_PACKS.some((p) => p.id === settings.activePack)) {
      activePack = settings.activePack
    }
    if (typeof settings.soundEnabled === 'boolean') {
      soundEnabled = settings.soundEnabled
    }
  } catch {
    // Use defaults
  }
}

async function saveSettings(): Promise<void> {
  await writeFile(SETTINGS_FILE, JSON.stringify({ activePack, soundEnabled }, null, 2))
}

function showPackContextMenu(): void {
  if (!mainWindow) return

  const packItems = STICKER_PACKS.map((pack) => ({
    label: pack.name,
    type: 'radio' as const,
    checked: pack.id === activePack,
    click: (): void => {
      activePack = pack.id
      saveSettings().catch((err) => {
        console.error('Failed to save settings:', err)
      })
      mainWindow?.webContents.send('pack-changed', activePack)
    }
  }))

  const menu = Menu.buildFromTemplate([
    ...packItems,
    { type: 'separator' },
    {
      label: 'Sound',
      type: 'checkbox',
      checked: soundEnabled,
      click: (): void => {
        soundEnabled = !soundEnabled
        saveSettings().catch((err) => {
          console.error('Failed to save settings:', err)
        })
        mainWindow?.webContents.send('sound-changed', soundEnabled)
      }
    }
  ])
  menu.popup({ window: mainWindow })
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 200,
    height: 280,
    x: width - 220,
    y: height - 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Allow clicking through transparent areas
  mainWindow.setIgnoreMouseEvents(false)

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupStatusWatcher(): void {
  if (debug) console.log(`[status-watcher] watching ${SESSIONS_FILE} and ${STATUS_FILE}`)

  const watcher = watch([SESSIONS_FILE, STATUS_FILE], getStatusWatchOptions())

  watcher.on('add', (filePath: string) => {
    scheduleStatusSend(`add:${filePath}`)
  })
  watcher.on('change', (filePath: string) => {
    scheduleStatusSend(`change:${filePath}`)
  })
  watcher.on('error', (err) => {
    console.error('[status-watcher] error:', err)
  })
}

function setupUsageWatcher(): void {
  if (debug) console.log(`[usage-watcher] watching ${USAGE_FILE}`)

  const watcher = watch(USAGE_FILE, getStatusWatchOptions())

  watcher.on('add', () => scheduleUsageSend('add'))
  watcher.on('change', () => scheduleUsageSend('change'))
  watcher.on('unlink', () => scheduleUsageSend('unlink'))
  watcher.on('error', (err) => {
    console.error('[usage-watcher] error:', err)
  })
}

function formatStatusSummary(status: MultiSessionStatus): string {
  const summary = status.sessions.map((session) => `${session.source}:${session.status}:${session.sessionId}`).join(', ')
  return `${status.primary.status} - ${status.primary.action} (${status.sessionCount} sessions)${summary ? ` [${summary}]` : ''}`
}

const statusUpdateCoalescer = createStatusUpdateCoalescer<MultiSessionStatus>({
  delayMs: STATUS_WATCH_DEBOUNCE_MS,
  load: readMultiSessionStatus,
  emit: (status) => {
    if (!mainWindow) return
    mainWindow.webContents.send('status-update', status)
  },
  onSend: (status, reasons) => {
    if (debug) console.log(`[status-watcher] sending from ${reasons.join(', ')}: ${formatStatusSummary(status)}`)
  },
  onSkip: (status, reasons) => {
    if (debug) console.log(`[status-watcher] skipping duplicate update from ${reasons.join(', ')}: ${formatStatusSummary(status)}`)
  }
})

function scheduleStatusSend(reason: string): void {
  statusUpdateCoalescer.schedule(reason)
}

const usageUpdateCoalescer = createStatusUpdateCoalescer<UsageInfo | null>({
  delayMs: STATUS_WATCH_DEBOUNCE_MS,
  load: readUsage,
  emit: (usage) => {
    if (!mainWindow) return
    mainWindow.webContents.send('usage-update', usage)
  },
  onSend: (usage, reasons) => {
    if (debug) console.log(`[usage-watcher] sending from ${reasons.join(', ')}: ${usage ? `${usage.usedPercentage}% resets ${usage.resetsAt}` : 'null'}`)
  },
  onSkip: (_usage, reasons) => {
    if (debug) console.log(`[usage-watcher] skipping duplicate update from ${reasons.join(', ')}`)
  }
})

function scheduleUsageSend(reason: string): void {
  usageUpdateCoalescer.schedule(reason)
}

// IPC handlers
ipcMain.handle('get-status', async () => {
  return await readMultiSessionStatus()
})

ipcMain.handle('get-active-pack', () => {
  return activePack
})

ipcMain.handle('get-sound-enabled', () => {
  return soundEnabled
})

ipcMain.handle('get-usage', async () => {
  return await readUsage()
})

// Programmatic drag state
let dragState: { startX: number; startY: number; winX: number; winY: number } | null = null

ipcMain.on('drag-start', (_event, { x, y }: { x: number; y: number }) => {
  if (!mainWindow) return
  const [winX, winY] = mainWindow.getPosition()
  dragState = { startX: x, startY: y, winX, winY }
})

ipcMain.on('drag-move', (_event, { x, y }: { x: number; y: number }) => {
  if (!mainWindow || !dragState) return
  const newX = dragState.winX + (x - dragState.startX)
  const newY = dragState.winY + (y - dragState.startY)
  mainWindow.setPosition(newX, newY)
})

ipcMain.on('drag-end', () => {
  dragState = null
})

ipcMain.on('show-pack-menu', () => {
  showPackContextMenu()
})

app.whenReady().then(async () => {
  app.setName('Agent Paperclip')
  await ensureStatusDir()
  startDevCodexWatcher()
  await loadSettings()
  createWindow()
  setupStatusWatcher()
  setupUsageWatcher()

  // Set custom dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../icon.png')
    if (existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath)
      app.dock?.setIcon(icon)
    }
  }

  // Send initial status
  setTimeout(() => {
    scheduleStatusSend('initial')
    scheduleUsageSend('initial')
  }, 1000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', () => {
  statusUpdateCoalescer.cancel()
  usageUpdateCoalescer.cancel()
  stopDevCodexWatcher()
})
