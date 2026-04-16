#!/usr/bin/env node

/**
 * Codex Watcher for Agent Paperclip
 *
 * Long-lived process that tails Codex session files and writes
 * pet status updates to ~/.agent-paperclip/status.json.
 *
 * Launched automatically by `agent-paperclip` when ~/.codex/ exists.
 */

import { existsSync } from 'fs'
import { watch } from 'chokidar'
import { writeStatus, writeSessionStatus, writeUsage, removeSession, sessionIdFromPath } from '../lib/status-writer'
import { findLatestSession, CODEX_HOME, SESSIONS_DIR } from './session-finder'
import { watchSession, watchForFirstSession, WINDOWS_POLL_INTERVAL_MS } from './session-watcher'
import { mapCodexEvent, extractUsageFromEntry, extractRateLimitsFromEntry } from './event-mapper'
import type { CodexRolloutEntry } from './types'
import type { TokenUsage } from '../shared/types'
import type { SessionWatcher } from './session-watcher'

const debug = !!process.env.COMPANION_DEBUG
let watcher: SessionWatcher | null = null

export function createEventHandler(): (entry: CodexRolloutEntry, sessionFile: string) => void {
  const usageBySession = new Map<string, TokenUsage>()

  return function handleEvent(entry: CodexRolloutEntry, sessionFile: string): void {
    const sessionId = sessionIdFromPath(sessionFile)

    if (debug) {
      const subtype = entry.type === 'event_msg' || entry.type === 'response_item'
        ? ` (${(entry as { payload?: { type?: string } }).payload?.type})`
        : ''
      console.error(`[watcher] event: ${entry.type}${subtype} (session=${sessionId})`)
    }

    // A new session starts with session_meta; clear usage for this session.
    if (entry.type === 'session_meta') {
      usageBySession.delete(sessionId)
    }

    // Track usage from token_count events
    const usage = extractUsageFromEntry(entry)
    if (usage) usageBySession.set(sessionId, usage)

    // Mirror Codex's rate limits to usage.json so the badge can render.
    const rateSnapshot = extractRateLimitsFromEntry(entry)
    if (rateSnapshot) {
      writeUsage(rateSnapshot).catch((err) => {
        console.error(`[watcher] writeUsage failed:`, err)
      })
    }

    // Map to pet state
    const update = mapCodexEvent(entry)
    if (!update) return

    const sessionUsage = update.usage ?? usageBySession.get(sessionId)

    if (debug) console.error(`[watcher] -> ${update.status}: ${update.action}`)

    // Write to sessions.json for multi-session support
    writeSessionStatus(sessionId, 'codex', update.status, update.action, sessionUsage)
      .catch((err) => {
        console.error(`[watcher] writeSessionStatus failed:`, err)
      })

    // Also write legacy status.json for backward compat
    writeStatus(update.status, update.action, sessionUsage ?? null)
      .catch((err) => {
        console.error(`[watcher] writeStatus failed:`, err)
      })

    // Clean up session on task_complete
    if (entry.type === 'event_msg' && (entry.payload as { type?: string }).type === 'task_complete') {
      usageBySession.delete(sessionId)
      removeSession(sessionId).catch((err) => {
        console.error(`[watcher] removeSession failed:`, err)
      })
    }
  }
}

const handleEvent = createEventHandler()

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
  if (debug) console.error(`[watcher] starting, platform=${process.platform}, CODEX_HOME=${CODEX_HOME}, SESSIONS_DIR=${SESSIONS_DIR}`)

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

  const dirWatcher = watch(CODEX_HOME, {
    persistent: true,
    depth: 0,
    ignoreInitial: true,
    ...(process.platform === 'win32' ? { usePolling: true, interval: WINDOWS_POLL_INTERVAL_MS } : {})
  })
  if (debug) console.error(`[watcher] waiting for sessions dir to appear under ${CODEX_HOME}`)
  dirWatcher.on('addDir', async (dirPath: string) => {
    if (debug) console.error(`[watcher] directory added: ${dirPath}`)
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
