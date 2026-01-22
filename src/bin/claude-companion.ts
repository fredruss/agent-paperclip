#!/usr/bin/env node

/**
 * Claude Code Companion CLI
 *
 * Commands:
 *   claude-companion       - Launch the desktop pet app
 *   claude-companion setup - Configure Claude Code hooks (with confirmation)
 */

import { spawn } from 'child_process'
import path from 'path'
import {
  SETTINGS_FILE,
  askConfirmation,
  runSetupSync
} from '../lib/setup'

async function runSetup(): Promise<void> {
  console.log('\nClaude Code Companion Setup\n')
  console.log('This will configure Claude Code hooks to send status updates to the pet.')
  console.log('The following file will be modified:')
  console.log(`  ${SETTINGS_FILE}\n`)

  const confirmed = await askConfirmation('Proceed? (y/n) ')

  if (!confirmed) {
    console.log('\nSetup cancelled.')
    console.log('\nTo configure manually, add hooks to ~/.claude/settings.json.')
    console.log('See the README for configuration details.\n')
    process.exit(0)
  }

  console.log('\nConfiguring hooks...\n')

  const result = runSetupSync()

  if (!result.success) {
    console.error('Error during setup:', result.error)
    process.exit(1)
  }

  console.log(`Copied hook script to ${result.hookPath}`)
  if (result.backupPath) {
    console.log(`Backed up existing settings to ${result.backupPath}`)
  }
  console.log(`Updated Claude Code settings at ${result.settingsPath}`)
  console.log('\nSetup complete!')
  console.log('Run "claude-companion" to launch the desktop pet.\n')
}

function launchApp(): void {
  // Get the electron binary path from the installed electron package
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronPath = require('electron') as string

  // Path to the built Electron app
  const appPath = path.join(__dirname, '..', 'out', 'main', 'index.js')

  // Spawn Electron as a detached process
  const child = spawn(electronPath, [appPath], {
    detached: true,
    stdio: 'ignore'
  })

  // Unref to allow the parent process to exit independently
  child.unref()

  console.log('Claude Code Companion launched!')
}

const command = process.argv[2]

async function main(): Promise<void> {
  if (command === 'setup') {
    await runSetup()
  } else if (command === undefined) {
    launchApp()
  } else {
    console.log('Usage: claude-companion [setup]')
    console.log('')
    console.log('Commands:')
    console.log('  (none)  Launch the desktop pet')
    console.log('  setup   Configure Claude Code hooks')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
