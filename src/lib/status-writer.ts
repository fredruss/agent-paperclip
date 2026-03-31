/**
 * Shared status writer for Agent Paperclip
 *
 * Writes pet status updates to ~/.agent-paperclip/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */

import { writeFile, readFile, mkdir, open, rename, rm, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import type { PetState, TokenUsage, Status, SessionSource, SessionsFile } from '../shared/types'

export const STATUS_DIR = join(homedir(), '.agent-paperclip')
export const STATUS_FILE = join(STATUS_DIR, 'status.json')
export const SESSIONS_FILE = join(STATUS_DIR, 'sessions.json')
const SESSIONS_LOCK_FILE = `${SESSIONS_FILE}.lock`
const SESSIONS_LOCK_RETRY_MS = 50
const SESSIONS_LOCK_TIMEOUT_MS = 5_000
const SESSIONS_LOCK_STALE_MS = 30_000
let writeChain: Promise<void> = Promise.resolve()

export async function ensureStatusDir(): Promise<void> {
  if (!existsSync(STATUS_DIR)) {
    await mkdir(STATUS_DIR, { recursive: true })
  }
}

export async function writeStatus(
  status: PetState,
  action: string,
  usage: TokenUsage | null = null
): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()

    const data: Status = {
      status,
      action,
      timestamp: Date.now()
    }
    if (usage) {
      data.usage = usage
    }

    await writeFile(STATUS_FILE, JSON.stringify(data, null, 2))
  })

  // Keep queue processing even after a rejected write.
  writeChain = task.catch(() => {
    // noop
  })

  await task
}

export function sessionIdFromPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 8)
}

async function readSessionsFile(): Promise<SessionsFile> {
  try {
    const raw = await readFile(SESSIONS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.sessions && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions)) {
      return parsed as SessionsFile
    }
    return { sessions: {} }
  } catch {
    return { sessions: {} }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isStaleLockFile(): Promise<boolean> {
  try {
    const lockStats = await stat(SESSIONS_LOCK_FILE)
    return Date.now() - lockStats.mtimeMs > SESSIONS_LOCK_STALE_MS
  } catch {
    return false
  }
}

async function acquireSessionsLock(): Promise<() => Promise<void>> {
  const deadline = Date.now() + SESSIONS_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const handle = await open(SESSIONS_LOCK_FILE, 'wx')
      await handle.close()

      return async () => {
        await rm(SESSIONS_LOCK_FILE, { force: true })
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') {
        throw error
      }

      if (await isStaleLockFile()) {
        await rm(SESSIONS_LOCK_FILE, { force: true })
        continue
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring sessions lock: ${SESSIONS_LOCK_FILE}`)
      }

      await sleep(SESSIONS_LOCK_RETRY_MS)
    }
  }
}

async function writeSessionsFile(file: SessionsFile): Promise<void> {
  const tempFile = `${SESSIONS_FILE}.${process.pid}.${Date.now()}.tmp`
  let renamed = false

  try {
    await writeFile(tempFile, JSON.stringify(file, null, 2))
    await rename(tempFile, SESSIONS_FILE)
    renamed = true
  } finally {
    if (!renamed) {
      await rm(tempFile, { force: true }).catch(() => {
        // noop
      })
    }
  }
}

async function updateSessionsFile(
  update: (file: SessionsFile) => void
): Promise<void> {
  const releaseLock = await acquireSessionsLock()

  try {
    const file = await readSessionsFile()
    update(file)
    await writeSessionsFile(file)
  } finally {
    await releaseLock()
  }
}

export async function writeSessionStatus(
  sessionId: string,
  source: SessionSource,
  status: PetState,
  action: string,
  usage?: TokenUsage
): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()
    await updateSessionsFile((file) => {
      const now = Date.now()
      file.sessions[sessionId] = {
        sessionId,
        source,
        status,
        action,
        timestamp: file.sessions[sessionId]?.timestamp ?? now,
        lastActivity: now,
        ...(usage ? { usage } : {})
      }
    })
  })

  writeChain = task.catch(() => {
    // noop
  })

  await task
}

export async function removeSession(sessionId: string): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()
    await updateSessionsFile((file) => {
      delete file.sessions[sessionId]
    })
  })

  writeChain = task.catch(() => {
    // noop
  })

  await task
}

export async function clearSessions(): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()
    await updateSessionsFile((file) => {
      file.sessions = {}
    })
  })

  writeChain = task.catch(() => {
    // noop
  })

  await task
}
