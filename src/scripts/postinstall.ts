#!/usr/bin/env node

/**
 * Agent Paperclip Post-install Script
 *
 * Prompts user to configure Claude Code hooks.
 */

import {
  SETTINGS_FILE,
  runSetupSync,
  askConfirmation
} from '../lib/setup'

async function main(): Promise<void> {
  console.log('\nAgent Paperclip installed!\n')
  console.log('To show Claude Code status, hooks need to be added to:')
  console.log(`  ${SETTINGS_FILE}\n`)

  // Skip interactive setup in CI or non-TTY environments
  const isInteractive = process.stdin.isTTY && !process.env.CI
  if (!isInteractive) {
    console.log('Run "agent-paperclip setup" to configure hooks.\n')
    return
  }

  const confirmed = await askConfirmation('Configure hooks now? (y/n) ')

  if (!confirmed) {
    console.log('\nSkipped. Run "agent-paperclip setup" later to configure.\n')
    return
  }

  console.log('\nConfiguring hooks...\n')

  const result = runSetupSync()

  if (!result.success) {
    console.error('Error:', result.error)
    process.exit(1)
  }

  console.log(`Copied hook script to ${result.hookPath}`)
  if (result.backupPath) {
    console.log(`Backed up existing settings to ${result.backupPath}`)
  }
  console.log(`Updated settings at ${result.settingsPath}`)
  console.log('\nSetup complete! Run "agent-paperclip" to launch.\n')
}

main()
