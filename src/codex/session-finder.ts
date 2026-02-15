/**
 * Finds the latest active Codex session file.
 *
 * Codex writes session data to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 * This module scans that directory tree for the most recently modified file.
 */

import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export const CODEX_HOME = join(homedir(), '.codex')
export const SESSIONS_DIR = join(CODEX_HOME, 'sessions')

/**
 * Find the latest Codex session file by walking the date-based directory tree.
 * Returns the path to the most recently modified rollout JSONL file, or null.
 */
export async function findLatestSession(): Promise<string | null> {
  if (!existsSync(SESSIONS_DIR)) return null

  try {
    // Walk year/month/day directories in reverse order to find newest first
    const years = await readdir(SESSIONS_DIR)
    const sortedYears = years.filter(isNumericDir).sort().reverse()

    for (const year of sortedYears) {
      const yearDir = join(SESSIONS_DIR, year)
      const months = await readdir(yearDir)
      const sortedMonths = months.filter(isNumericDir).sort().reverse()

      for (const month of sortedMonths) {
        const monthDir = join(yearDir, month)
        const days = await readdir(monthDir)
        const sortedDays = days.filter(isNumericDir).sort().reverse()

        for (const day of sortedDays) {
          const dayDir = join(monthDir, day)
          const files = await readdir(dayDir)
          const rollouts = files.filter(f => f.startsWith('rollout-') && f.endsWith('.jsonl'))

          if (rollouts.length === 0) continue

          // Find the most recently modified file in this day directory
          let latestFile: string | null = null
          let latestMtime = 0

          for (const file of rollouts) {
            const filePath = join(dayDir, file)
            const fileStat = await stat(filePath)
            if (fileStat.mtimeMs > latestMtime) {
              latestMtime = fileStat.mtimeMs
              latestFile = filePath
            }
          }

          if (latestFile) return latestFile
        }
      }
    }

    return null
  } catch {
    return null
  }
}

function isNumericDir(name: string): boolean {
  return /^\d+$/.test(name)
}
