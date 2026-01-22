#!/usr/bin/env node
"use strict";
/**
 * Claude Code Companion Post-install Script
 *
 * Installs app dependencies and prompts user to configure Claude Code hooks.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const setup_1 = require("../lib/setup");
async function main() {
    // Install app dependencies if app folder exists
    const appDir = path_1.default.join(__dirname, '..', 'app');
    if (fs_1.default.existsSync(path_1.default.join(appDir, 'package.json'))) {
        console.log('\nInstalling app dependencies...');
        try {
            (0, child_process_1.execSync)('npm install', { cwd: appDir, stdio: 'inherit' });
        }
        catch {
            console.error('Failed to install app dependencies');
            process.exit(1);
        }
    }
    console.log('\nClaude Code Companion installed!\n');
    console.log('To show Claude Code status, hooks need to be added to:');
    console.log(`  ${setup_1.SETTINGS_FILE}\n`);
    // Skip interactive setup in CI or non-TTY environments
    const isInteractive = process.stdin.isTTY && !process.env.CI;
    if (!isInteractive) {
        console.log('Run "claude-companion setup" to configure hooks.\n');
        return;
    }
    const confirmed = await (0, setup_1.askConfirmation)('Configure hooks now? (y/n) ');
    if (!confirmed) {
        console.log('\nSkipped. Run "claude-companion setup" later to configure.\n');
        return;
    }
    console.log('\nConfiguring hooks...\n');
    const result = (0, setup_1.runSetupSync)();
    if (!result.success) {
        console.error('Error:', result.error);
        process.exit(1);
    }
    console.log(`Copied hook script to ${result.hookPath}`);
    if (result.backupPath) {
        console.log(`Backed up existing settings to ${result.backupPath}`);
    }
    console.log(`Updated settings at ${result.settingsPath}`);
    console.log('\nSetup complete! Run "npm run dev" to launch.\n');
}
main();
