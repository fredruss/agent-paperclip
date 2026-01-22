#!/usr/bin/env node

/**
 * Claude Code Companion Post-install Script
 *
 * Installs app dependencies and prompts user to configure Claude Code hooks.
 */

import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import {
  SETTINGS_FILE,
  runSetupSync,
  askConfirmation
} from '../lib/setup'

async function main(): Promise<void> {
  // Install app dependencies if app folder exists
  const appDir = path.join(__dirname, '..', 'app')
  if (fs.existsSync(path.join(appDir, 'package.json'))) {
    console.log('\nInstalling app dependencies...')
    try {
      execSync('npm install', { cwd: appDir, stdio: 'inherit' })
    } catch {
      console.error('Failed to install app dependencies')
      process.exit(1)
    }
  }

  console.log('\nClaude Code Companion installed!\n')
  console.log('To show Claude Code status, hooks need to be added to:')
  console.log(`  ${SETTINGS_FILE}\n`)

  // Skip interactive setup in CI or non-TTY environments
  const isInteractive = process.stdin.isTTY && !process.env.CI
  if (!isInteractive) {
    console.log('Run "claude-companion setup" to configure hooks.\n')
    return
  }

  const confirmed = await askConfirmation('Configure hooks now? (y/n) ')

  if (!confirmed) {
    console.log('\nSkipped. Run "claude-companion setup" later to configure.\n')
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
  console.log('\nSetup complete! Run "npm run dev" to launch.\n')
}

main()
