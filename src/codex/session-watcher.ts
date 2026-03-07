/**
 * Watches a Codex session file for new JSONL entries.
 *
 * Uses chokidar to detect file changes, then reads only the new content
 * appended since the last read. Detects new session files and switches
 * to watching them.
 */

import { open, stat } from 'fs/promises'
import { watch } from 'chokidar'
import type { FSWatcher } from 'chokidar'
import type { CodexRolloutEntry } from './types'
import { SESSIONS_DIR } from './session-finder'

const debug = !!process.env.COMPANION_DEBUG

export type EventCallback = (entry: CodexRolloutEntry, sessionFile: string) => void

interface FileState {
  offset: number
  lineRemainder: string
  reading: boolean
  dirty: boolean
}

export interface SessionWatcher {
  close(): Promise<void>
}

export interface ParsedChunk {
  entries: CodexRolloutEntry[]
  remainder: string
}

/**
 * Parse a chunk of JSONL text while preserving incomplete trailing lines.
 */
export function parseJsonlChunk(chunk: string, previousRemainder: string = ''): ParsedChunk {
  const combined = previousRemainder + chunk
  const lines = combined.split('\n')
  let remainder = lines.pop() ?? ''
  const entries: CodexRolloutEntry[] = []

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line) as CodexRolloutEntry)
    } catch {
      // Skip malformed lines.
    }
  }

  // Handle JSONL files that may not end with a newline.
  if (remainder.trim()) {
    try {
      entries.push(JSON.parse(remainder) as CodexRolloutEntry)
      remainder = ''
    } catch {
      // Keep incomplete trailing JSON for the next read.
    }
  }

  return { entries, remainder }
}

/**
 * Start watching a session file for new events.
 * Calls onEvent for each new JSONL entry appended to the file.
 * Also watches the sessions directory for new session files and switches automatically.
 */
export async function watchSession(
  sessionFile: string,
  onEvent: EventCallback
): Promise<SessionWatcher> {
  const files = new Map<string, FileState>()

  async function addFile(filePath: string, skipExisting: boolean): Promise<void> {
    let offset = 0
    if (skipExisting) {
      try {
        const fileStat = await stat(filePath)
        offset = fileStat.size
      } catch {
        offset = 0
      }
    }
    files.set(filePath, { offset, lineRemainder: '', reading: false, dirty: false })
    fileWatcher.add(filePath)
  }

  async function processFile(filePath: string, state: FileState): Promise<void> {
    if (state.reading) {
      state.dirty = true
      return
    }
    state.reading = true
    state.dirty = false
    try {
      const fileStat = await stat(filePath)
      if (fileStat.size <= state.offset) return

      const fd = await open(filePath, 'r')
      try {
        const buf = Buffer.alloc(fileStat.size - state.offset)
        await fd.read(buf, 0, buf.length, state.offset)
        state.offset = fileStat.size

        const newContent = buf.toString('utf8')
        if (debug) console.error(`[session-watcher] read ${buf.length} new bytes from ${filePath}`)
        const parsed = parseJsonlChunk(newContent, state.lineRemainder)
        state.lineRemainder = parsed.remainder

        if (debug) console.error(`[session-watcher] parsed ${parsed.entries.length} entries`)
        for (const entry of parsed.entries) {
          onEvent(entry, filePath)
        }
      } finally {
        await fd.close()
      }
    } catch {
      // File may have been removed or rotated
    } finally {
      state.reading = false
      if (state.dirty) {
        state.dirty = false
        processFile(filePath, state)
      }
    }
  }

  // Watch session files for changes
  const usePolling = process.platform === 'win32'
  const fileWatcher = watch([], {
    persistent: true,
    ...(usePolling && { usePolling: true, interval: 500 })
  })
  fileWatcher.on('change', (changedPath: string) => {
    const state = files.get(changedPath)
    if (!state) return
    if (debug) console.error(`[session-watcher] change detected in ${changedPath}`)
    processFile(changedPath, state)
  })

  // Add the initial session file (skip existing content — don't replay old events)
  await addFile(sessionFile, true)

  // Watch the sessions directory for new session files
  let dirWatcher: FSWatcher | null = null
  try {
    dirWatcher = watch(SESSIONS_DIR, {
      persistent: true,
      depth: 3,
      ignoreInitial: true
    })

    dirWatcher.on('add', (newPath: string) => {
      if (newPath.endsWith('.jsonl') && newPath.includes('rollout-') && !files.has(newPath)) {
        // Read from start — new files may already have content when the add event fires
        addFile(newPath, false).then(() => {
          processFile(newPath, files.get(newPath)!)
        })
      }
    })
  } catch {
    // Sessions directory may not exist yet
  }

  return {
    async close() {
      await fileWatcher.close()
      if (dirWatcher) await dirWatcher.close()
    }
  }
}

/**
 * Watch the sessions directory for the first session file to appear.
 * Returns a watcher that calls onEvent when events arrive.
 */
export async function watchForFirstSession(
  onEvent: EventCallback
): Promise<SessionWatcher> {
  let sessionWatcher: SessionWatcher | null = null
  let found = false

  const dirWatcher = watch(SESSIONS_DIR, {
    persistent: true,
    depth: 3,
    ignoreInitial: true
  })

  dirWatcher.on('add', async (newPath: string) => {
    if (found) return
    if (newPath.endsWith('.jsonl') && newPath.includes('rollout-')) {
      found = true
      // Found the first session file - switch to session watching
      await dirWatcher.close()
      sessionWatcher = await watchSession(newPath, onEvent)
    }
  })

  return {
    async close() {
      if (sessionWatcher) {
        await sessionWatcher.close()
      } else {
        await dirWatcher.close()
      }
    }
  }
}
