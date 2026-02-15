#!/usr/bin/env node

/**
 * Codex Companion Watcher
 *
 * Long-lived process that tails Codex session files and writes
 * pet status updates to ~/.claude-companion/status.json.
 *
 * Launched automatically by `claude-companion` when ~/.codex/ exists.
 */

import { existsSync } from 'fs'
import { watch } from 'chokidar'
import { writeStatus } from '../lib/status-writer'
import { findLatestSession, CODEX_HOME, SESSIONS_DIR } from './session-finder'
import { watchSession, watchForFirstSession } from './session-watcher'
import { mapCodexEvent, extractUsageFromEntry } from './event-mapper'
import type { CodexRolloutEntry } from './types'
import type { TokenUsage } from '../shared/types'
import type { SessionWatcher } from './session-watcher'

let watcher: SessionWatcher | null = null
let latestUsage: TokenUsage | undefined

function handleEvent(entry: CodexRolloutEntry): void {
  // Track usage from token_count events
  const usage = extractUsageFromEntry(entry)
  if (usage) latestUsage = usage

  // Map to pet state
  const update = mapCodexEvent(entry)
  if (!update) return

  writeStatus(update.status, update.action, update.usage ?? latestUsage ?? null)
    .catch(() => {
      // Ignore write errors silently
    })
}

async function startSessionWatching(): Promise<void> {
  const sessionFile = await findLatestSession()

  if (sessionFile) {
    watcher = await watchSession(sessionFile, handleEvent)
  } else {
    watcher = await watchForFirstSession(handleEvent)
  }
}

async function start(): Promise<void> {
  if (existsSync(SESSIONS_DIR)) {
    await startSessionWatching()
    return
  }

  // Sessions directory doesn't exist yet - watch for it to appear
  if (!existsSync(CODEX_HOME)) return

  const dirWatcher = watch(CODEX_HOME, { persistent: true, depth: 0, ignoreInitial: true })
  dirWatcher.on('addDir', async (dirPath: string) => {
    if (dirPath.endsWith('sessions')) {
      await dirWatcher.close()
      await startSessionWatching()
    }
  })

  // Re-check after watcher is set up to close the race window
  if (existsSync(SESSIONS_DIR)) {
    await dirWatcher.close()
    await startSessionWatching()
  }
}

async function shutdown(): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  process.exit(0)
}

process.on('SIGTERM', () => { shutdown() })
process.on('SIGINT', () => { shutdown() })

start().catch((err) => {
  console.error('Codex watcher error:', err)
  process.exit(1)
})
