import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { app } from 'electron'

const CODEX_HOME = join(homedir(), '.codex')

let devWatcherProcess: ChildProcess | null = null

function isProcessActive(process: ChildProcess | null): process is ChildProcess {
  return process !== null && process.exitCode === null && !process.killed
}

function getWatcherPath(): string {
  return resolve(app.getAppPath(), '..', 'codex', 'watcher.js')
}

export function startDevCodexWatcher(): void {
  if (app.isPackaged) return
  if (isProcessActive(devWatcherProcess)) return
  if (!existsSync(CODEX_HOME)) return

  const watcherPath = getWatcherPath()
  if (!existsSync(watcherPath)) {
    console.warn(`Codex watcher script not found at ${watcherPath}`)
    return
  }

  const child = spawn(process.execPath, [watcherPath], {
    stdio: 'ignore'
  })

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
