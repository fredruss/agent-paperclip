#!/usr/bin/env node

/**
 * Claude Code Companion Post-install Script
 *
 * Configures Claude Code hooks to send status updates to the desktop pet.
 * - Copies the status reporter hook to ~/.claude-companion/hooks/
 * - Adds hook configuration to ~/.claude/settings.json
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { HookEntry, HooksConfig, ClaudeSettings } from '../shared/types'

const HOME = os.homedir()
const COMPANION_DIR = path.join(HOME, '.claude-companion')
const COMPANION_HOOKS_DIR = path.join(COMPANION_DIR, 'hooks')
const CLAUDE_DIR = path.join(HOME, '.claude')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')

// Path to the hook script in the installed package
const SOURCE_HOOK = path.join(__dirname, '..', 'hooks', 'status-reporter.js')
const DEST_HOOK = path.join(COMPANION_HOOKS_DIR, 'status-reporter.js')

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyHookScript(): void {
  ensureDir(COMPANION_HOOKS_DIR)
  fs.copyFileSync(SOURCE_HOOK, DEST_HOOK)
  console.log(`Copied hook script to ${DEST_HOOK}`)
}

function createHookConfig(): HooksConfig {
  // Use the path in the user's home directory
  const command = `node "${DEST_HOOK}"`

  return {
    UserPromptSubmit: [
      {
        hooks: [{ type: 'command', command }]
      }
    ],
    PreToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command }]
      }
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [{ type: 'command', command }]
      }
    ],
    Stop: [
      {
        hooks: [{ type: 'command', command }]
      }
    ],
    Notification: [
      {
        hooks: [{ type: 'command', command }]
      }
    ]
  }
}

function updateSettings(): void {
  ensureDir(CLAUDE_DIR)

  let settings: ClaudeSettings = {}

  // Read existing settings if present
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf8')
      settings = JSON.parse(content) as ClaudeSettings

      // Create backup
      const backupFile = `${SETTINGS_FILE}.backup-${Date.now()}`
      fs.copyFileSync(SETTINGS_FILE, backupFile)
      console.log(`Backed up existing settings to ${backupFile}`)
    } catch {
      console.warn('Warning: Could not parse existing settings.json, creating new one')
      settings = {}
    }
  }

  // Initialize hooks object if not present
  if (!settings.hooks) {
    settings.hooks = {}
  }

  const newHooks = createHookConfig()

  // Merge hooks - add claude-companion hooks to existing ones
  for (const [eventName, eventHooks] of Object.entries(newHooks)) {
    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = []
    }

    const hookArray = settings.hooks[eventName] as HookEntry[]

    // Check if claude-companion hook already exists
    const existingIndex = hookArray.findIndex((h) =>
      h.hooks?.some((hook) => hook.command?.includes('claude-companion'))
    )

    if (existingIndex >= 0) {
      // Update existing hook
      hookArray[existingIndex] = eventHooks![0]
    } else {
      // Add new hook
      hookArray.push(eventHooks![0])
    }
  }

  // Write updated settings
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  console.log(`Updated Claude Code settings at ${SETTINGS_FILE}`)
}

function main(): void {
  console.log('\nConfiguring Claude Code Companion hooks...\n')

  try {
    copyHookScript()
    updateSettings()

    console.log('\nClaude Code Companion installed successfully!')
    console.log('\nRun "claude-companion" to launch the desktop pet.')
    console.log("The pet will show Claude Code's status when you use it in a terminal.\n")
  } catch (err) {
    console.error('Error during installation:', (err as Error).message)
    process.exit(1)
  }
}

main()
