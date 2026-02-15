#!/usr/bin/env node

/**
 * Claude Code Companion CLI
 *
 * Commands:
 *   claude-companion       - Launch the desktop pet app
 *   claude-companion stop  - Stop the running app
 *   claude-companion setup - Configure Claude Code hooks (with confirmation)
 */

import { spawn, execSync } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'
import {
  SETTINGS_FILE,
  COMPANION_DIR,
  askConfirmation,
  runSetupSync
} from '../lib/setup'
import { writePid, readPid, isProcessRunning, removePid } from '../lib/pid'
import { CODEX_HOME } from '../codex/session-finder'

const CODEX_WATCHER_PID_FILE = path.join(COMPANION_DIR, 'codex-watcher.pid')

async function runSetup(): Promise<void> {
  console.log('\nClaude Code Companion Setup\n')
  console.log('This will configure Claude Code hooks to send status updates to the pet.')
  console.log('The following file will be modified:')
  console.log(`  ${SETTINGS_FILE}\n`)

  const confirmed = await askConfirmation('Proceed? (y/n) ')

  if (!confirmed) {
    console.log('\nSetup cancelled.')
    console.log('\nTo configure manually, add hooks to ~/.claude/settings.json.')
    console.log('See the README for configuration details.\n')
    process.exit(0)
  }

  console.log('\nConfiguring hooks...\n')

  const result = runSetupSync()

  if (!result.success) {
    console.error('Error during setup:', result.error)
    process.exit(1)
  }

  console.log(`Copied hook script to ${result.hookPath}`)
  if (result.backupPath) {
    console.log(`Backed up existing settings to ${result.backupPath}`)
  }
  console.log(`Updated Claude Code settings at ${result.settingsPath}`)
  console.log('\nSetup complete!')
  console.log('Run "claude-companion" to launch the desktop pet.\n')
}

function isCodexWatcher(pid: number): boolean {
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim()
    return cmd.includes('codex/watcher')
  } catch {
    return false
  }
}

function launchCodexWatcher(): void {
  // Skip if Codex isn't installed
  if (!existsSync(CODEX_HOME)) return

  // Skip if already running (verify it's actually our watcher, not a stale PID)
  const existingPid = readPid(CODEX_WATCHER_PID_FILE)
  if (existingPid && isProcessRunning(existingPid) && isCodexWatcher(existingPid)) return

  const watcherPath = path.join(__dirname, '..', 'codex', 'watcher.js')
  if (!existsSync(watcherPath)) return

  const child = spawn(process.execPath, [watcherPath], {
    detached: true,
    stdio: 'ignore'
  })

  if (child.pid) {
    writePid(CODEX_WATCHER_PID_FILE, child.pid)
  }

  child.unref()
}

function stopCodexWatcher(): void {
  const pid = readPid(CODEX_WATCHER_PID_FILE)
  if (!pid) return

  // Only kill if the process is actually our watcher
  if (isProcessRunning(pid) && isCodexWatcher(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Process may have already exited
    }
  }

  removePid(CODEX_WATCHER_PID_FILE)
}

function launchApp(): void {
  // Get the electron binary path from the installed electron package
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronPath = require('electron') as string

  // Path to the built Electron app
  const appPath = path.join(__dirname, '..', 'out', 'main', 'index.js')

  // Spawn Electron as a detached process
  const child = spawn(electronPath, [appPath], {
    detached: true,
    stdio: 'ignore'
  })

  // Unref to allow the parent process to exit independently
  child.unref()

  // Also start the Codex watcher if Codex is installed
  launchCodexWatcher()

  console.log('Claude Code Companion launched!')
}

export function stopApp(): void {
  if (process.platform === 'win32') {
    stopAppWindows()
  } else {
    stopAppUnix()
  }

  stopCodexWatcher()
}

export function stopAppWindows(): void {
  try {
    // Pattern matches both local dev (claude-companion) and npm-installed (claude-code-companion)
    const pattern = '*companion*out*main*index.js*'

    // Use PowerShell to find electron processes (replacement for deprecated wmic)
    const findScript =
      `Get-CimInstance Win32_Process | ` +
      `Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '${pattern}' } | ` +
      `Select-Object -ExpandProperty ProcessId`

    const output = execSync(`powershell -NoProfile -Command "${findScript}"`, {
      encoding: 'utf-8'
    }).trim()

    if (!output) {
      console.log('Claude Code Companion is not running.')
      return
    }

    // Kill each process with taskkill
    const pids = output.split(/\r?\n/).filter((p) => p.trim())
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid.trim()}`, { stdio: 'ignore' })
      } catch {
        // Ignore errors - child processes may already be terminated
      }
    }
    console.log('Claude Code Companion stopped.')
  } catch {
    console.log('Claude Code Companion is not running.')
  }
}

export function stopAppUnix(): void {
  try {
    // Kill Electron processes running claude-companion
    // Match the app path argument: .../claude-code-companion/out/main/index.js
    execSync('pkill -f "claude-code-companion/out/main"', { stdio: 'ignore' })
    console.log('Claude Code Companion stopped.')
  } catch {
    // pkill returns non-zero if no processes matched
    console.log('Claude Code Companion is not running.')
  }
}

const command = process.argv[2]

async function main(): Promise<void> {
  if (command === 'setup') {
    await runSetup()
  } else if (command === 'stop') {
    stopApp()
  } else if (command === undefined) {
    launchApp()
  } else {
    console.log('Usage: claude-companion [command]')
    console.log('')
    console.log('Commands:')
    console.log('  (none)  Launch the desktop pet')
    console.log('  stop    Stop the running app')
    console.log('  setup   Configure Claude Code hooks')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
