#!/usr/bin/env node

/**
 * Agent Paperclip Pre-uninstall Script
 *
 * Removes Claude Code hooks configuration.
 * - Removes hook entries from ~/.claude/settings.json
 * - Deletes the copied hook script from ~/.agent-paperclip/hooks/
 * - Preserves ~/.agent-paperclip/status.json (user data)
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { HookEntry, ClaudeSettings, StatusLineConfig } from '../shared/types'

const HOME = os.homedir()
const COMPANION_DIR = path.join(HOME, '.agent-paperclip')
const COMPANION_HOOKS_DIR = path.join(COMPANION_DIR, 'hooks')
const COMPANION_LIB_DIR = path.join(COMPANION_DIR, 'lib')
const CLAUDE_DIR = path.join(HOME, '.claude')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const HOOK_SCRIPT = path.join(COMPANION_HOOKS_DIR, 'status-reporter.js')
const USAGE_REPORTER_SCRIPT = path.join(COMPANION_HOOKS_DIR, 'usage-reporter.js')
const WRAPPED_STATUSLINE_FILE = path.join(COMPANION_DIR, 'wrapped-statusline.json')
const LIB_STATUS_WRITER = path.join(COMPANION_LIB_DIR, 'status-writer.js')

function removeHookScript(): void {
  for (const script of [HOOK_SCRIPT, USAGE_REPORTER_SCRIPT]) {
    if (fs.existsSync(script)) {
      fs.unlinkSync(script)
      console.log(`Removed hook script: ${script}`)
    }
  }

  // Try to remove hooks directory if empty
  try {
    const files = fs.readdirSync(COMPANION_HOOKS_DIR)
    if (files.length === 0) {
      fs.rmdirSync(COMPANION_HOOKS_DIR)
      console.log(`Removed empty directory: ${COMPANION_HOOKS_DIR}`)
    }
  } catch {
    // Directory not empty or doesn't exist, that's fine
  }
}

function removeLibFiles(): void {
  if (fs.existsSync(LIB_STATUS_WRITER)) {
    fs.unlinkSync(LIB_STATUS_WRITER)
    console.log(`Removed lib file: ${LIB_STATUS_WRITER}`)

    // Try to remove lib directory if empty
    try {
      const files = fs.readdirSync(COMPANION_LIB_DIR)
      if (files.length === 0) {
        fs.rmdirSync(COMPANION_LIB_DIR)
        console.log(`Removed empty directory: ${COMPANION_LIB_DIR}`)
      }
    } catch {
      // Directory not empty or doesn't exist, that's fine
    }
  }
}

function removeHooksFromSettings(): void {
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.log('No settings.json found, nothing to clean up')
    return
  }

  let settings: ClaudeSettings
  try {
    const content = fs.readFileSync(SETTINGS_FILE, 'utf8')
    settings = JSON.parse(content) as ClaudeSettings
  } catch (err) {
    console.warn('Warning: Could not parse settings.json:', (err as Error).message)
    return
  }

  if (!settings.hooks) {
    console.log('No hooks configured, nothing to remove')
    return
  }

  let modified = false

  // Remove agent-paperclip hooks from each event type
  const eventTypes = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification']
  for (const eventName of eventTypes) {
    if (!settings.hooks[eventName]) continue

    const hookArray = settings.hooks[eventName] as HookEntry[]
    const originalLength = hookArray.length
    settings.hooks[eventName] = hookArray.filter((h) => {
      // Remove hooks that reference agent-paperclip (or old claude-companion name)
      const isCompanionHook = h.hooks?.some((hook) =>
        hook.command?.includes('agent-paperclip') || hook.command?.includes('claude-companion')
      )
      return !isCompanionHook
    })

    if (settings.hooks[eventName]!.length < originalLength) {
      modified = true
    }

    // Remove empty arrays
    if (settings.hooks[eventName]!.length === 0) {
      delete settings.hooks[eventName]
    }
  }

  // Remove empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks
  }

  if (modified) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
    console.log(`Removed Agent Paperclip hooks from ${SETTINGS_FILE}`)
  } else {
    console.log('No Agent Paperclip hooks found in settings')
  }
}

function readWrappedStatusLine(): StatusLineConfig | null {
  if (!fs.existsSync(WRAPPED_STATUSLINE_FILE)) return null
  try {
    const content = fs.readFileSync(WRAPPED_STATUSLINE_FILE, 'utf8')
    const parsed = JSON.parse(content) as StatusLineConfig
    if (!parsed?.command) return null
    return parsed
  } catch {
    return null
  }
}

function cleanupWrappedStatusLineFile(): void {
  if (fs.existsSync(WRAPPED_STATUSLINE_FILE)) {
    fs.unlinkSync(WRAPPED_STATUSLINE_FILE)
  }
}

function restoreStatusLine(): void {
  if (!fs.existsSync(SETTINGS_FILE)) {
    // No Claude settings exist — our statusLine can't be referenced, so the
    // wrapper backup is orphaned and safe to drop.
    cleanupWrappedStatusLineFile()
    return
  }

  let settings: ClaudeSettings
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as ClaudeSettings
  } catch {
    // settings.json is unreadable — we can't tell whether Claude still points
    // at usage-reporter.js, so preserve the backup for manual recovery.
    return
  }

  const current = settings.statusLine
  const isOurs = current?.command?.includes('usage-reporter.js') ?? false
  if (!current || !isOurs) {
    // Our statusLine isn't active (user changed it, or never set). The backup
    // is orphaned and safe to drop.
    cleanupWrappedStatusLineFile()
    return
  }

  const wrapped = readWrappedStatusLine()
  if (wrapped) {
    settings.statusLine = wrapped
    console.log(`Restored original statusLine in ${SETTINGS_FILE}`)
  } else {
    delete settings.statusLine
    console.log(`Removed Agent Paperclip statusLine from ${SETTINGS_FILE}`)
  }

  // Only drop the backup once the restore write succeeds. If writeFileSync
  // throws, the caller's top-level handler logs the error and the backup
  // stays on disk so the user can recover.
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  cleanupWrappedStatusLineFile()
}

function main(): void {
  console.log('\nRemoving Agent Paperclip hooks...\n')

  try {
    removeHooksFromSettings()
    restoreStatusLine()
    removeHookScript()
    removeLibFiles()

    console.log('\nAgent Paperclip hooks removed.')
    console.log('Note: ~/.agent-paperclip/status.json was preserved.\n')
  } catch (err) {
    console.error('Error during uninstall:', (err as Error).message)
    // Don't exit with error - allow uninstall to continue
  }
}

main()
