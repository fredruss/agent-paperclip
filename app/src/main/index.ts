import { app, BrowserWindow, ipcMain, screen, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { watch } from 'chokidar'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import type { Status } from '../shared/types'

const STATUS_DIR = join(homedir(), '.claude-companion')
const STATUS_FILE = join(STATUS_DIR, 'status.json')
const SETTINGS_FILE = join(STATUS_DIR, 'settings.json')

let mainWindow: BrowserWindow | null = null

// Sticker pack definitions (id and name only - renderer has the actual assets)
const STICKER_PACKS = [
  { id: 'bot1', name: 'Bot1' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'svg', name: 'SVG' }
]

let activePack = 'bot1'

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
  app.setName('Claude Code Companion')
  await ensureStatusDir()
  await loadSettings()
  createWindow()
  setupStatusWatcher()

  // Set custom dock icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../icon.png')
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
