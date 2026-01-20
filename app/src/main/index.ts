import { app, BrowserWindow, ipcMain, screen, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { watch } from 'chokidar'
import { readFile, mkdir, writeFile, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'

const STATUS_DIR = join(homedir(), '.claude-companion')
const STATUS_FILE = join(STATUS_DIR, 'status.json')
const SETTINGS_FILE = join(STATUS_DIR, 'settings.json')
const COMPANION_HOOKS_DIR = join(STATUS_DIR, 'hooks')
const CLAUDE_DIR = join(homedir(), '.claude')
const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

let mainWindow: BrowserWindow | null = null

// Sticker pack definitions (id and name only - renderer has the actual assets)
const STICKER_PACKS = [
  { id: 'bot1', name: 'Bot1' },
  { id: 'svg', name: 'SVG' }
]

let activePack = 'bot1'

interface Status {
  status: 'idle' | 'working' | 'reading' | 'done' | 'error'
  action: string
  timestamp: number
}

async function ensureStatusDir(): Promise<void> {
  if (!existsSync(STATUS_DIR)) {
    await mkdir(STATUS_DIR, { recursive: true })
  }
}

async function readStatus(): Promise<Status> {
  try {
    const content = await readFile(STATUS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return { status: 'idle', action: 'Waiting for Claude Code...', timestamp: Date.now() }
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

function getHookSourcePath(): string {
  // In packaged app, hooks are in resources/hooks/
  // In development, they're in ../hooks/ relative to app folder
  if (app.isPackaged) {
    return join(process.resourcesPath, 'hooks', 'status-reporter.js')
  }
  return join(__dirname, '../../../hooks/status-reporter.js')
}

function createHookConfig(hookScriptPath: string): Record<string, unknown[]> {
  const command = `node "${hookScriptPath}"`
  return {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command }] }],
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    Stop: [{ hooks: [{ type: 'command', command }] }],
    Notification: [{ hooks: [{ type: 'command', command }] }]
  }
}

async function isHookConfigured(): Promise<boolean> {
  // Verify the hook script file exists
  const destPath = join(COMPANION_HOOKS_DIR, 'status-reporter.js')
  if (!existsSync(destPath)) {
    return false
  }

  try {
    const content = await readFile(CLAUDE_SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(content)
    // Check if any hook references claude-companion
    const hooksStr = JSON.stringify(settings.hooks || {})
    return hooksStr.includes('claude-companion')
  } catch {
    return false
  }
}

async function setupHooks(): Promise<void> {
  // Check if hooks are already configured
  if (await isHookConfigured()) {
    console.log('Claude Companion hooks already configured')
    return
  }

  console.log('Setting up Claude Companion hooks...')

  // Ensure directories exist
  if (!existsSync(COMPANION_HOOKS_DIR)) {
    await mkdir(COMPANION_HOOKS_DIR, { recursive: true })
  }
  if (!existsSync(CLAUDE_DIR)) {
    await mkdir(CLAUDE_DIR, { recursive: true })
  }

  // Copy hook script to ~/.claude-companion/hooks/
  const sourcePath = getHookSourcePath()
  const destPath = join(COMPANION_HOOKS_DIR, 'status-reporter.js')

  if (!existsSync(sourcePath)) {
    console.error('Hook source not found:', sourcePath)
    return
  }

  await copyFile(sourcePath, destPath)
  console.log('Copied hook script to', destPath)

  // Read existing Claude settings or create new
  let claudeSettings: Record<string, unknown> = {}
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    // Create backup BEFORE attempting to parse
    const backupFile = `${CLAUDE_SETTINGS_FILE}.backup-${Date.now()}`
    await copyFile(CLAUDE_SETTINGS_FILE, backupFile)
    console.log('Backed up settings to', backupFile)

    try {
      const content = await readFile(CLAUDE_SETTINGS_FILE, 'utf-8')
      claudeSettings = JSON.parse(content)
    } catch {
      console.warn('Could not parse existing settings, starting fresh (backup saved)')
      claudeSettings = {}
    }
  }

  // Merge hooks
  if (!claudeSettings.hooks) {
    claudeSettings.hooks = {}
  }
  const hooks = claudeSettings.hooks as Record<string, unknown[]>
  const newHooks = createHookConfig(destPath)

  for (const [eventName, eventHooks] of Object.entries(newHooks)) {
    if (!hooks[eventName]) {
      hooks[eventName] = []
    }
    // Check if claude-companion hook already exists
    const hookArray = hooks[eventName] as Array<{ hooks?: Array<{ command?: string }> }>
    const existingIndex = hookArray.findIndex(
      (h) => h.hooks?.some((hook) => hook.command?.includes('claude-companion'))
    )
    if (existingIndex >= 0) {
      hookArray[existingIndex] = eventHooks[0] as typeof hookArray[number]
    } else {
      hookArray.push(eventHooks[0] as typeof hookArray[number])
    }
  }

  // Write updated settings
  await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(claudeSettings, null, 2))
  console.log('Updated Claude settings at', CLAUDE_SETTINGS_FILE)
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
  const watcher = watch(STATUS_FILE, {
    persistent: true,
    ignoreInitial: false
  })

  watcher.on('add', sendStatus)
  watcher.on('change', sendStatus)
}

async function sendStatus(): Promise<void> {
  if (!mainWindow) return
  const status = await readStatus()
  mainWindow.webContents.send('status-update', status)
}

// IPC handlers
ipcMain.handle('get-status', async () => {
  return await readStatus()
})

ipcMain.handle('get-active-pack', () => {
  return activePack
})

ipcMain.on('start-drag', () => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(false)
  }
})

ipcMain.on('show-pack-menu', () => {
  showPackContextMenu()
})

app.whenReady().then(async () => {
  await ensureStatusDir()
  try {
    await setupHooks()
  } catch (err) {
    const { dialog } = await import('electron')
    dialog.showErrorBox(
      'Claude Companion Setup Failed',
      `Could not configure hooks:\n\n${err instanceof Error ? err.message : String(err)}\n\nCheck that your home directory is writable.`
    )
    app.quit()
    return
  }
  await loadSettings()
  createWindow()
  setupStatusWatcher()

  // Set custom dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../../resources/icon.png')
    if (existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath)
      app.dock.setIcon(icon)
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
