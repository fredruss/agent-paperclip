/**
 * Shared status writer for Claude Companion
 *
 * Writes pet status updates to ~/.claude-companion/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PetState, TokenUsage, Status } from '../shared/types'

export const STATUS_DIR = join(homedir(), '.claude-companion')
export const STATUS_FILE = join(STATUS_DIR, 'status.json')
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
