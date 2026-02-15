/**
 * PID file utilities for managing background processes.
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'

export function writePid(pidFile: string, pid: number): void {
  writeFileSync(pidFile, String(pid))
}

export function readPid(pidFile: string): number | null {
  if (!existsSync(pidFile)) return null
  try {
    const content = readFileSync(pidFile, 'utf8').trim()
    if (!/^\d+$/.test(content)) return null
    return parseInt(content, 10)
  } catch {
    return null
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function removePid(pidFile: string): void {
  try {
    unlinkSync(pidFile)
  } catch {
    // File may not exist
  }
}
