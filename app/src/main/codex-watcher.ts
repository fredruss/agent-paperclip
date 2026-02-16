import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

const CODEX_HOME = join(homedir(), '.codex')
const debug = !!process.env.COMPANION_DEBUG

let devWatcherProcess: ChildProcess | null = null

function isProcessActive(process: ChildProcess | null): process is ChildProcess {
  return process !== null && process.exitCode === null && !process.killed
}

function getWatcherPath(): string {
  return resolve(app.getAppPath(), '..', 'codex', 'watcher.js')
}

export function startDevCodexWatcher(): void {
  if (process.env.NODE_ENV !== 'development') {
    if (debug) console.log('[codex-watcher] skipped: not development')
    return
  }
  if (app.isPackaged) {
    if (debug) console.log('[codex-watcher] skipped: app is packaged')
    return
  }
  if (isProcessActive(devWatcherProcess)) {
    if (debug) console.log('[codex-watcher] skipped: already running')
    return
  }
  if (!existsSync(CODEX_HOME)) {
    if (debug) console.log(`[codex-watcher] skipped: ${CODEX_HOME} not found`)
    return
  }

  const watcherPath = getWatcherPath()
  if (!existsSync(watcherPath)) {
    console.warn(`Codex watcher script not found at ${watcherPath}`)
    return
  }

  if (debug) console.log(`[codex-watcher] spawning: ${watcherPath}`)

  const child = spawn(process.execPath, [watcherPath], {
    stdio: debug ? ['ignore', 'ignore', 'pipe'] : 'ignore',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })

  if (debug) {
    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[codex-watcher] ${data.toString().trimEnd()}`)
    })
  }

  devWatcherProcess = child

  child.once('exit', () => {
    if (devWatcherProcess === child) {
      devWatcherProcess = null
    }
  })

  child.once('error', () => {
    if (devWatcherProcess === child) {
      devWatcherProcess = null
    }
  })
}

export function stopDevCodexWatcher(): void {
  if (!devWatcherProcess) return

  const child = devWatcherProcess
  devWatcherProcess = null

  if (isProcessActive(child)) {
    try {
      child.kill('SIGTERM')
    } catch {
      // Child may have already exited.
    }
  }
}
