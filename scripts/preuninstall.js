#!/usr/bin/env node
"use strict";
/**
 * Agent Paperclip Pre-uninstall Script
 *
 * Removes Claude Code hooks configuration.
 * - Removes hook entries from ~/.claude/settings.json
 * - Deletes the copied hook script from ~/.agent-paperclip/hooks/
 * - Preserves ~/.agent-paperclip/status.json (user data)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const HOME = os_1.default.homedir();
const COMPANION_HOOKS_DIR = path_1.default.join(HOME, '.agent-paperclip', 'hooks');
const CLAUDE_DIR = path_1.default.join(HOME, '.claude');
const SETTINGS_FILE = path_1.default.join(CLAUDE_DIR, 'settings.json');
const HOOK_SCRIPT = path_1.default.join(COMPANION_HOOKS_DIR, 'status-reporter.js');
function removeHookScript() {
    if (fs_1.default.existsSync(HOOK_SCRIPT)) {
        fs_1.default.unlinkSync(HOOK_SCRIPT);
        console.log(`Removed hook script: ${HOOK_SCRIPT}`);
        // Try to remove hooks directory if empty
        try {
            const files = fs_1.default.readdirSync(COMPANION_HOOKS_DIR);
            if (files.length === 0) {
                fs_1.default.rmdirSync(COMPANION_HOOKS_DIR);
                console.log(`Removed empty directory: ${COMPANION_HOOKS_DIR}`);
            }
        }
        catch {
            // Directory not empty or doesn't exist, that's fine
        }
    }
}
function removeHooksFromSettings() {
    if (!fs_1.default.existsSync(SETTINGS_FILE)) {
        console.log('No settings.json found, nothing to clean up');
        return;
    }
    let settings;
    try {
        const content = fs_1.default.readFileSync(SETTINGS_FILE, 'utf8');
        settings = JSON.parse(content);
    }
    catch (err) {
        console.warn('Warning: Could not parse settings.json:', err.message);
        return;
    }
    if (!settings.hooks) {
        console.log('No hooks configured, nothing to remove');
        return;
    }
    let modified = false;
    // Remove agent-paperclip hooks from each event type
    const eventTypes = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification'];
    for (const eventName of eventTypes) {
        if (!settings.hooks[eventName])
            continue;
        const hookArray = settings.hooks[eventName];
        const originalLength = hookArray.length;
        settings.hooks[eventName] = hookArray.filter((h) => {
            // Remove hooks that reference agent-paperclip (or old claude-companion name)
            const isCompanionHook = h.hooks?.some((hook) => hook.command?.includes('agent-paperclip') || hook.command?.includes('claude-companion'));
            return !isCompanionHook;
        });
        if (settings.hooks[eventName].length < originalLength) {
            modified = true;
        }
        // Remove empty arrays
        if (settings.hooks[eventName].length === 0) {
            delete settings.hooks[eventName];
        }
    }
    // Remove empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
    }
    if (modified) {
        fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        console.log(`Removed Agent Paperclip hooks from ${SETTINGS_FILE}`);
    }
    else {
        console.log('No Agent Paperclip hooks found in settings');
    }
}
function main() {
    console.log('\nRemoving Agent Paperclip hooks...\n');
    try {
        removeHooksFromSettings();
        removeHookScript();
        console.log('\nAgent Paperclip hooks removed.');
        console.log('Note: ~/.agent-paperclip/status.json was preserved.\n');
    }
    catch (err) {
        console.error('Error during uninstall:', err.message);
        // Don't exit with error - allow uninstall to continue
    }
}
main();
