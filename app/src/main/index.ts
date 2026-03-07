import { app, BrowserWindow, ipcMain, screen, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { watch } from 'chokidar'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { Status, MultiSessionStatus, SessionInfo, SessionSource, TokenUsage } from '../shared/types'
import { startDevCodexWatcher, stopDevCodexWatcher } from './codex-watcher'

const STATUS_DIR = join(homedir(), '.agent-paperclip')
const STATUS_FILE = join(STATUS_DIR, 'status.json')
const SESSIONS_FILE = join(STATUS_DIR, 'sessions.json')
const SETTINGS_FILE = join(STATUS_DIR, 'settings.json')
const debug = !!process.env.COMPANION_DEBUG
const STALE_SESSION_MS = 30_000

let mainWindow: BrowserWindow | null = null

// Sticker pack definitions (id and name only - renderer has the actual assets)
const STICKER_PACKS = [
  { id: 'bot1', name: 'Bot1' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'paperclip', name: 'Paperclip' },
  { id: 'svg', name: 'SVG' }
]

let activePack = 'paperclip'
const STALE_ACTIVITY_MS = 10_000

function stripUsage(status: Status): Status {
  const statusWithoutUsage = { ...status }
  delete statusWithoutUsage.usage
  return statusWithoutUsage
}

function normalizeStatus(status: Status): Status {
  const age = Date.now() - status.timestamp
  if (age < STALE_ACTIVITY_MS) return status
  const staleStatus = stripUsage(status)

  // Transient activity states should not remain forever across app restarts.
  if (status.status === 'thinking' && status.action === 'Responding...') {
    return { ...staleStatus, status: 'done', action: 'All done!' }
  }
  if (status.status === 'thinking' || status.status === 'working' || status.status === 'reading') {
    return { ...staleStatus, status: 'idle', action: 'Waiting for Agent...' }
  }

  return staleStatus
}

async function ensureStatusDir(): Promise<void> {
  if (!existsSync(STATUS_DIR)) {
    await mkdir(STATUS_DIR, { recursive: true })
  }
}

async function readLegacyStatus(): Promise<Status> {
  try {
    const content = await readFile(STATUS_FILE, 'utf-8')
    const status = JSON.parse(content) as Status
    return normalizeStatus(status)
  } catch {
    return { status: 'idle', action: 'Waiting for Agent...', timestamp: Date.now() }
  }
}

interface SessionsFileFormat {
  sessions: Record<string, {
    sessionId: string
    source: SessionSource
    status: string
    action: string
    timestamp: number
    lastActivity: number
    usage?: TokenUsage
  }>
}

function buildMultiSessionStatus(parsed: SessionsFileFormat): MultiSessionStatus {
  const now = Date.now()
  const entries = Object.values(parsed.sessions)
    .filter((s) => now - s.lastActivity < STALE_SESSION_MS)
    .sort((a, b) => b.lastActivity - a.lastActivity)

  if (entries.length === 0) {
    return {
      primary: { status: 'idle', action: 'Waiting for Agent...', timestamp: now },
      sessions: [],
      sessionCount: 0
    }
  }

  const first = entries[0]
  const primary = normalizeStatus({
    status: first.status as Status['status'],
    action: first.action,
    timestamp: first.lastActivity,
    usage: first.usage
  })

  const sessions: SessionInfo[] = entries.map((s) => ({
    sessionId: s.sessionId,
    source: s.source,
    status: s.status as SessionInfo['status'],
    action: s.action,
    usage: s.usage
  }))

  return { primary, sessions, sessionCount: entries.length }
}

function legacyToMultiSession(legacy: Status): MultiSessionStatus {
  const isActive = legacy.status !== 'idle'
  const sessions: SessionInfo[] = isActive
    ? [{ sessionId: 'legacy', source: 'claude-code', status: legacy.status, action: legacy.action, usage: legacy.usage }]
    : []
  return { primary: legacy, sessions, sessionCount: isActive ? 1 : 0 }
}

async function readMultiSessionStatus(): Promise<MultiSessionStatus> {
  try {
    const content = await readFile(SESSIONS_FILE, 'utf-8')
    const parsed = JSON.parse(content) as SessionsFileFormat
    const result = buildMultiSessionStatus(parsed)
    // If all sessions are stale, check legacy status.json too
    if (result.sessionCount === 0) {
      return legacyToMultiSession(await readLegacyStatus())
    }
    return result
  } catch {
    // Fall back to legacy status.json
    return legacyToMultiSession(await readLegacyStatus())
  }
}

interface Settings {
  activePack: string
}

async function loadSettings(): Promise<void> {
  try {
    const content = await readFile(SETTINGS_FILE, 'utf-8')
    const settings: Settings = JSON.parse(content)
    if (settings.activePack && STICKER_PACKS.some((p) => p.id === settings.activePack)) {
      activePack = settings.activePack
    }
  } catch {
    // Use defaults
  }
}

async function saveSettings(): Promise<void> {
  await writeFile(SETTINGS_FILE, JSON.stringify({ activePack }, null, 2))
}

function showPackContextMenu(): void {
  if (!mainWindow) return

  const template = STICKER_PACKS.map((pack) => ({
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

  const menu = Menu.buildFromTemplate(template)
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

  const usePolling = process.platform === 'win32'
  const watcher = watch([SESSIONS_FILE, STATUS_FILE], {
    persistent: true,
    ignoreInitial: false,
    ...(usePolling && { usePolling: true, interval: 250 })
  })

  watcher.on('add', () => {
    if (debug) console.log('[status-watcher] file added')
    sendStatus()
  })
  watcher.on('change', () => {
    if (debug) console.log('[status-watcher] file changed')
    sendStatus()
  })
  watcher.on('error', (err) => {
    console.error('[status-watcher] error:', err)
  })
}

async function sendStatus(): Promise<void> {
  if (!mainWindow) return
  const status = await readMultiSessionStatus()
  if (debug) console.log(`[status-watcher] sending: ${status.primary.status} - ${status.primary.action} (${status.sessionCount} sessions)`)
  mainWindow.webContents.send('status-update', status)
}

// IPC handlers
ipcMain.handle('get-status', async () => {
  return await readMultiSessionStatus()
})

ipcMain.handle('get-active-pack', () => {
  return activePack
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

  // Set custom dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../icon.png')
    if (existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath)
      app.dock?.setIcon(icon)
    }
  }

  // Send initial status
  setTimeout(sendStatus, 1000)
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
  stopDevCodexWatcher()
})
