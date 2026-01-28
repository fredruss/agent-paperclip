#!/usr/bin/env node
"use strict";
/**
 * Claude Code Companion CLI
 *
 * Commands:
 *   claude-companion       - Launch the desktop pet app
 *   claude-companion stop  - Stop the running app
 *   claude-companion setup - Configure Claude Code hooks (with confirmation)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const setup_1 = require("../lib/setup");
async function runSetup() {
    console.log('\nClaude Code Companion Setup\n');
    console.log('This will configure Claude Code hooks to send status updates to the pet.');
    console.log('The following file will be modified:');
    console.log(`  ${setup_1.SETTINGS_FILE}\n`);
    const confirmed = await (0, setup_1.askConfirmation)('Proceed? (y/n) ');
    if (!confirmed) {
        console.log('\nSetup cancelled.');
        console.log('\nTo configure manually, add hooks to ~/.claude/settings.json.');
        console.log('See the README for configuration details.\n');
        process.exit(0);
    }
    console.log('\nConfiguring hooks...\n');
    const result = (0, setup_1.runSetupSync)();
    if (!result.success) {
        console.error('Error during setup:', result.error);
        process.exit(1);
    }
    console.log(`Copied hook script to ${result.hookPath}`);
    if (result.backupPath) {
        console.log(`Backed up existing settings to ${result.backupPath}`);
    }
    console.log(`Updated Claude Code settings at ${result.settingsPath}`);
    console.log('\nSetup complete!');
    console.log('Run "claude-companion" to launch the desktop pet.\n');
}
function launchApp() {
    // Get the electron binary path from the installed electron package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electronPath = require('electron');
    // Path to the built Electron app
    const appPath = path_1.default.join(__dirname, '..', 'out', 'main', 'index.js');
    // Spawn Electron as a detached process
    const child = (0, child_process_1.spawn)(electronPath, [appPath], {
        detached: true,
        stdio: 'ignore'
    });
    // Unref to allow the parent process to exit independently
    child.unref();
    console.log('Claude Code Companion launched!');
}
function stopApp() {
    try {
        // Kill Electron processes running claude-companion
        // Match the app path argument: .../claude-code-companion/out/main/index.js
        (0, child_process_1.execSync)('pkill -f "claude-code-companion/out/main"', { stdio: 'ignore' });
        console.log('Claude Code Companion stopped.');
    }
    catch {
        // pkill returns non-zero if no processes matched
        console.log('Claude Code Companion is not running.');
    }
}
const command = process.argv[2];
async function main() {
    if (command === 'setup') {
        await runSetup();
    }
    else if (command === 'stop') {
        stopApp();
    }
    else if (command === undefined) {
        launchApp();
    }
    else {
        console.log('Usage: claude-companion [command]');
        console.log('');
        console.log('Commands:');
        console.log('  (none)  Launch the desktop pet');
        console.log('  stop    Stop the running app');
        console.log('  setup   Configure Claude Code hooks');
        process.exit(1);
    }
}
main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
