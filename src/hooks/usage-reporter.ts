#!/usr/bin/env node

/**
 * Agent Paperclip Usage Reporter (statusLine wrapper)
 *
 * Claude Code invokes this script as the configured statusLine command,
 * passing a JSON payload on stdin. We extract the 5-hour rate-limit data
 * (Pro/Max only) and write it to ~/.agent-paperclip/usage.json so the
 * Electron app can render an idle-state usage badge.
 *
 * If the user had a pre-existing statusLine, setup records it in
 * ~/.agent-paperclip/wrapped-statusline.json; we spawn that command
 * with the same stdin and forward its stdout so the original still renders.
 *
 * Errors must never fail the statusLine — on any failure we print empty
 * and exit 0 so Claude Code's UI stays clean.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawnSync } from 'child_process'
import type { StatusLineConfig } from '../shared/types'

const HOME = os.homedir()
const COMPANION_DIR = path.join(HOME, '.agent-paperclip')
const USAGE_FILE = path.join(COMPANION_DIR, 'usage.json')
const WRAPPED_FILE = path.join(COMPANION_DIR, 'wrapped-statusline.json')

interface StatusLinePayload {
  rate_limits?: {
    five_hour?: {
      used_percentage?: number
      resets_at?: number
    }
  }
}

interface UsageSnapshot {
  usedPercentage: number
  resetsAt: number
  updatedAt: number
}

export function extractUsage(payload: StatusLinePayload): UsageSnapshot | null {
  const fiveHour = payload?.rate_limits?.five_hour
  if (!fiveHour) return null

  const { used_percentage, resets_at } = fiveHour
  if (typeof used_percentage !== 'number' || typeof resets_at !== 'number') {
    return null
  }

  return {
    usedPercentage: used_percentage,
    resetsAt: resets_at,
    updatedAt: Math.floor(Date.now() / 1000)
  }
}

function writeUsageAtomically(snapshot: UsageSnapshot): void {
  if (!fs.existsSync(COMPANION_DIR)) {
    fs.mkdirSync(COMPANION_DIR, { recursive: true })
  }
  const tmp = `${USAGE_FILE}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(snapshot))
  fs.renameSync(tmp, USAGE_FILE)
}

function readWrappedStatusLine(): StatusLineConfig | null {
  try {
    if (!fs.existsSync(WRAPPED_FILE)) return null
    const content = fs.readFileSync(WRAPPED_FILE, 'utf8')
    const parsed = JSON.parse(content) as StatusLineConfig
    if (!parsed.command) return null
    return parsed
  } catch {
    return null
  }
}

function forwardWrappedStatusLine(wrapped: StatusLineConfig, stdin: string): string {
  try {
    const result = spawnSync(wrapped.command, {
      input: stdin,
      shell: true,
      encoding: 'utf8',
      timeout: 5000
    })
    return result.stdout ?? ''
  } catch {
    return ''
  }
}

async function readStdin(): Promise<string> {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    input += chunk
  }
  return input
}

export async function main(): Promise<void> {
  let input = ''
  try {
    input = await readStdin()
  } catch {
    process.stdout.write('')
    return
  }

  if (input.trim()) {
    try {
      const payload = JSON.parse(input) as StatusLinePayload
      const snapshot = extractUsage(payload)
      if (snapshot) {
        try {
          writeUsageAtomically(snapshot)
        } catch {
          // Swallow write errors — never fail the statusLine
        }
      }
    } catch {
      // Malformed stdin — continue so a wrapped statusLine still runs
    }
  }

  const wrapped = readWrappedStatusLine()
  const output = wrapped ? forwardWrappedStatusLine(wrapped, input) : ''
  process.stdout.write(output)
}

const isMain = typeof require !== 'undefined' && require.main === module

if (isMain) {
  main().catch(() => {
    process.stdout.write('')
    process.exit(0)
  })
}
