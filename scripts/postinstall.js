#!/usr/bin/env node
"use strict";
/**
 * Agent Paperclip Post-install Script
 *
 * Prompts user to configure Claude Code hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const setup_1 = require("../lib/setup");
async function main() {
    console.log('\nAgent Paperclip installed!\n');
    console.log('To show Claude Code status, hooks need to be added to:');
    console.log(`  ${setup_1.SETTINGS_FILE}\n`);
    // Skip interactive setup in CI or non-TTY environments
    const isInteractive = process.stdin.isTTY && !process.env.CI;
    if (!isInteractive) {
        console.log('Run "agent-paperclip setup" to configure hooks.\n');
        return;
    }
    const confirmed = await (0, setup_1.askConfirmation)('Configure hooks now? (y/n) ');
    if (!confirmed) {
        console.log('\nSkipped. Run "agent-paperclip setup" later to configure.\n');
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
    console.log('\nSetup complete! Run "agent-paperclip" to launch.\n');
}
main();
