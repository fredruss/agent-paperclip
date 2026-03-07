/**
 * Shared status writer for Agent Paperclip
 *
 * Writes pet status updates to ~/.agent-paperclip/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */

import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import type { PetState, TokenUsage, Status, SessionSource, SessionsFile } from '../shared/types'

export const STATUS_DIR = join(homedir(), '.agent-paperclip')
export const STATUS_FILE = join(STATUS_DIR, 'status.json')
export const SESSIONS_FILE = join(STATUS_DIR, 'sessions.json')
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

export async function writeSessionStatus(
  sessionId: string,
  source: SessionSource,
  status: PetState,
  action: string,
  usage?: TokenUsage
): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()

    const file = await readSessionsFile()
    const now = Date.now()
    file.sessions[sessionId] = {
      sessionId,
      source,
      status,
      action,
      timestamp: now,
      lastActivity: now,
      ...(usage ? { usage } : {})
    }

    await writeFile(SESSIONS_FILE, JSON.stringify(file, null, 2))
  })

  writeChain = task.catch(() => {
    // noop
  })

  await task
}

export async function removeSession(sessionId: string): Promise<void> {
  const task = writeChain.then(async () => {
    await ensureStatusDir()

    const file = await readSessionsFile()
    delete file.sessions[sessionId]

    await writeFile(SESSIONS_FILE, JSON.stringify(file, null, 2))
  })

  writeChain = task.catch(() => {
    // noop
  })

  await task
}
