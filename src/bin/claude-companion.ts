#!/usr/bin/env node

/**
 * Claude Code Companion CLI Launcher
 *
 * Launches the Electron desktop pet app as a detached process
 * so it continues running after the terminal is closed.
 */

import { spawn } from 'child_process'
import path from 'path'

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
