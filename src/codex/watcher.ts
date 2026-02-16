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

const debug = !!process.env.COMPANION_DEBUG
let watcher: SessionWatcher | null = null
let latestUsage: TokenUsage | undefined

function handleEvent(entry: CodexRolloutEntry): void {
  if (debug) {
    const subtype = entry.type === 'event_msg' || entry.type === 'response_item'
      ? ` (${(entry as { payload?: { type?: string } }).payload?.type})`
      : ''
    console.error(`[watcher] event: ${entry.type}${subtype}`)
  }

  // A new session starts with session_meta; clear usage from any previous session.
  if (entry.type === 'session_meta') {
    latestUsage = undefined
  }

  // Track usage from token_count events
  const usage = extractUsageFromEntry(entry)
  if (usage) latestUsage = usage

  // Map to pet state
  const update = mapCodexEvent(entry)
  if (!update) return

  if (debug) console.error(`[watcher] -> ${update.status}: ${update.action}`)
  writeStatus(update.status, update.action, update.usage ?? latestUsage ?? null)
    .catch((err) => {
      console.error(`[watcher] writeStatus failed:`, err)
    })
}

async function startSessionWatching(): Promise<void> {
  const sessionFile = await findLatestSession()

  if (sessionFile) {
    if (debug) console.error(`[watcher] watching session: ${sessionFile}`)
    watcher = await watchSession(sessionFile, handleEvent)
  } else {
    if (debug) console.error('[watcher] no session found, waiting for first session...')
    watcher = await watchForFirstSession(handleEvent)
  }
}

async function start(): Promise<void> {
  if (debug) console.error(`[watcher] starting, SESSIONS_DIR=${SESSIONS_DIR}`)

  if (existsSync(SESSIONS_DIR)) {
    if (debug) console.error('[watcher] sessions dir exists')
    await startSessionWatching()
    return
  }

  // Sessions directory doesn't exist yet - watch for it to appear
  if (!existsSync(CODEX_HOME)) {
    if (debug) console.error('[watcher] no ~/.codex, exiting')
    process.exit(0)
  }

  const dirWatcher = watch(CODEX_HOME, { persistent: true, depth: 0, ignoreInitial: true })
  dirWatcher.on('addDir', async (dirPath: string) => {
    if (dirPath === SESSIONS_DIR) {
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

process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)) })
process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)) })

start().catch((err) => {
  console.error('Codex watcher error:', err)
  process.exit(1)
})
