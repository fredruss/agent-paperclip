/**
 * Agent Paperclip Setup Module
 *
 * Handles hook configuration for Claude Code settings.
 * Extracted for testability.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import type { HookEntry, HooksConfig, ClaudeSettings } from '../shared/types'

const HOME = os.homedir()
export const COMPANION_DIR = path.join(HOME, '.agent-paperclip')
export const COMPANION_HOOKS_DIR = path.join(COMPANION_DIR, 'hooks')
export const CLAUDE_DIR = path.join(HOME, '.claude')
export const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')

export interface SetupDeps {
  fs?: typeof fs
  readline?: typeof readline
  hookSourcePath?: string
  hookDestPath?: string
  settingsPath?: string
}

function getFs(deps?: SetupDeps): typeof fs {
  return deps?.fs ?? fs
}

export function ensureDir(dir: string, deps?: SetupDeps): void {
  const fsModule = getFs(deps)
  if (!fsModule.existsSync(dir)) {
    fsModule.mkdirSync(dir, { recursive: true })
  }
}

export function copyHookScript(sourcePath: string, destPath: string, deps?: SetupDeps): void {
  const fsModule = getFs(deps)
  const destDir = path.dirname(destPath)
  ensureDir(destDir, deps)
  fsModule.copyFileSync(sourcePath, destPath)
}

export function createHookConfig(hookPath: string): HooksConfig {
  const command = `node "${hookPath}"`

  return {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command }] }],
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    Stop: [{ hooks: [{ type: 'command', command }] }],
    Notification: [{ hooks: [{ type: 'command', command }] }]
  }
}

export function readSettings(settingsPath: string, deps?: SetupDeps): ClaudeSettings {
  const fsModule = getFs(deps)

  if (!fsModule.existsSync(settingsPath)) {
    return {}
  }

  const content = fsModule.readFileSync(settingsPath, 'utf8')
  return JSON.parse(content) as ClaudeSettings
}

export function createBackup(settingsPath: string, deps?: SetupDeps): string {
  const fsModule = getFs(deps)
  const backupPath = `${settingsPath}.backup-${Date.now()}`
  fsModule.copyFileSync(settingsPath, backupPath)
  return backupPath
}

export function mergeHooks(
  settings: ClaudeSettings,
  newHooks: HooksConfig
): ClaudeSettings {
  const result = { ...settings }

  if (!result.hooks) {
    result.hooks = {}
  }

  for (const [eventName, eventHooks] of Object.entries(newHooks)) {
    if (!result.hooks[eventName]) {
      result.hooks[eventName] = []
    }

    const hookArray = result.hooks[eventName] as HookEntry[]

    // Check if agent-paperclip hook already exists (also match old name for upgrades)
    const existingIndex = hookArray.findIndex((h) =>
      h.hooks?.some((hook) =>
        hook.command?.includes('agent-paperclip') || hook.command?.includes('claude-companion')
      )
    )

    if (existingIndex >= 0) {
      // Update existing hook
      hookArray[existingIndex] = eventHooks![0]
    } else {
      // Add new hook
      hookArray.push(eventHooks![0])
    }
  }

  return result
}

export function writeSettings(
  settingsPath: string,
  settings: ClaudeSettings,
  deps?: SetupDeps
): void {
  const fsModule = getFs(deps)
  const dir = path.dirname(settingsPath)
  ensureDir(dir, deps)
  fsModule.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

export interface SetupResult {
  success: boolean
  hookPath?: string
  settingsPath?: string
  backupPath?: string
  error?: string
}

export function runSetupSync(deps?: SetupDeps): SetupResult {
  const fsModule = getFs(deps)
  const sourcePath = deps?.hookSourcePath ?? path.join(__dirname, '..', 'hooks', 'status-reporter.js')
  const destPath = deps?.hookDestPath ?? path.join(COMPANION_HOOKS_DIR, 'status-reporter.js')
  const settingsPath = deps?.settingsPath ?? SETTINGS_FILE

  // Verify source exists
  if (!fsModule.existsSync(sourcePath)) {
    return {
      success: false,
      error: `Hook source not found: ${sourcePath}`
    }
  }

  // Copy hook script
  copyHookScript(sourcePath, destPath, deps)

  // Read existing settings
  let settings: ClaudeSettings = {}
  let backupPath: string | undefined

  if (fsModule.existsSync(settingsPath)) {
    // Create backup first
    backupPath = createBackup(settingsPath, deps)

    try {
      settings = readSettings(settingsPath, deps)
    } catch {
      // JSON parse failed, but backup is saved - continue with empty settings
      settings = {}
    }
  }

  // Merge hooks
  const newHooks = createHookConfig(destPath)
  const updatedSettings = mergeHooks(settings, newHooks)

  // Write settings
  writeSettings(settingsPath, updatedSettings, deps)

  return {
    success: true,
    hookPath: destPath,
    settingsPath,
    backupPath
  }
}

export function askConfirmation(
  question: string,
  rl?: readline.Interface
): Promise<boolean> {
  const rlInterface = rl ?? readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rlInterface.question(question, (answer) => {
      if (!rl) {
        rlInterface.close()
      }
      resolve(answer.toLowerCase() === 'y')
    })
  })
}
