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

export type EventCallback = (entry: CodexRolloutEntry) => void

export interface SessionWatcher {
  close(): Promise<void>
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
  let currentFile = sessionFile
  let watchedPath = sessionFile
  let offset = 0
  let reading = false
  let dirty = false

  // Start from current file size (don't replay old events)
  try {
    const fileStat = await stat(currentFile)
    offset = fileStat.size
  } catch {
    offset = 0
  }

  async function readNewContent(): Promise<void> {
    if (reading) {
      dirty = true
      return
    }
    reading = true
    dirty = false
    try {
      const fileStat = await stat(currentFile)
      if (fileStat.size <= offset) return

      const fd = await open(currentFile, 'r')
      try {
        const buf = Buffer.alloc(fileStat.size - offset)
        await fd.read(buf, 0, buf.length, offset)
        offset = fileStat.size

        const newContent = buf.toString('utf8')
        const lines = newContent.split('\n')

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const entry = JSON.parse(line) as CodexRolloutEntry
            onEvent(entry)
          } catch {
            // Skip malformed lines
          }
        }
      } finally {
        await fd.close()
      }
    } catch {
      // File may have been removed or rotated
    } finally {
      reading = false
      if (dirty) {
        dirty = false
        readNewContent()
      }
    }
  }

  // Watch the current session file for changes
  const fileWatcher = watch(currentFile, { persistent: true })
  fileWatcher.on('change', () => { readNewContent() })

  // Watch the sessions directory for new session files
  let dirWatcher: FSWatcher | null = null
  try {
    dirWatcher = watch(SESSIONS_DIR, {
      persistent: true,
      depth: 3,
      ignoreInitial: true
    })

    dirWatcher.on('add', (newPath: string) => {
      if (newPath.endsWith('.jsonl') && newPath.includes('rollout-')) {
        // Switch to watching the new session file
        const oldPath = watchedPath
        currentFile = newPath
        watchedPath = newPath
        offset = 0

        fileWatcher.unwatch(oldPath)
        fileWatcher.add(newPath)
        readNewContent()
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

  const dirWatcher = watch(SESSIONS_DIR, {
    persistent: true,
    depth: 3,
    ignoreInitial: true
  })

  dirWatcher.on('add', async (newPath: string) => {
    if (newPath.endsWith('.jsonl') && newPath.includes('rollout-')) {
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
