"use strict";
/**
 * Claude Code Companion Setup Module
 *
 * Handles hook configuration for Claude Code settings.
 * Extracted for testability.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTINGS_FILE = exports.CLAUDE_DIR = exports.COMPANION_HOOKS_DIR = exports.COMPANION_DIR = void 0;
exports.ensureDir = ensureDir;
exports.copyHookScript = copyHookScript;
exports.createHookConfig = createHookConfig;
exports.readSettings = readSettings;
exports.createBackup = createBackup;
exports.mergeHooks = mergeHooks;
exports.writeSettings = writeSettings;
exports.runSetupSync = runSetupSync;
exports.askConfirmation = askConfirmation;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const readline_1 = __importDefault(require("readline"));
const HOME = os_1.default.homedir();
exports.COMPANION_DIR = path_1.default.join(HOME, '.claude-companion');
exports.COMPANION_HOOKS_DIR = path_1.default.join(exports.COMPANION_DIR, 'hooks');
exports.CLAUDE_DIR = path_1.default.join(HOME, '.claude');
exports.SETTINGS_FILE = path_1.default.join(exports.CLAUDE_DIR, 'settings.json');
function getFs(deps) {
    return deps?.fs ?? fs_1.default;
}
function ensureDir(dir, deps) {
    const fsModule = getFs(deps);
    if (!fsModule.existsSync(dir)) {
        fsModule.mkdirSync(dir, { recursive: true });
    }
}
function copyHookScript(sourcePath, destPath, deps) {
    const fsModule = getFs(deps);
    const destDir = path_1.default.dirname(destPath);
    ensureDir(destDir, deps);
    fsModule.copyFileSync(sourcePath, destPath);
}
function createHookConfig(hookPath) {
    const command = `node "${hookPath}"`;
    return {
        UserPromptSubmit: [{ hooks: [{ type: 'command', command }] }],
        PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
        PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
        Stop: [{ hooks: [{ type: 'command', command }] }],
        Notification: [{ hooks: [{ type: 'command', command }] }]
    };
}
function readSettings(settingsPath, deps) {
    const fsModule = getFs(deps);
    if (!fsModule.existsSync(settingsPath)) {
        return {};
    }
    const content = fsModule.readFileSync(settingsPath, 'utf8');
    return JSON.parse(content);
}
function createBackup(settingsPath, deps) {
    const fsModule = getFs(deps);
    const backupPath = `${settingsPath}.backup-${Date.now()}`;
    fsModule.copyFileSync(settingsPath, backupPath);
    return backupPath;
}
function mergeHooks(settings, newHooks) {
    const result = { ...settings };
    if (!result.hooks) {
        result.hooks = {};
    }
    for (const [eventName, eventHooks] of Object.entries(newHooks)) {
        if (!result.hooks[eventName]) {
            result.hooks[eventName] = [];
        }
        const hookArray = result.hooks[eventName];
        // Check if claude-companion hook already exists
        const existingIndex = hookArray.findIndex((h) => h.hooks?.some((hook) => hook.command?.includes('claude-companion')));
        if (existingIndex >= 0) {
            // Update existing hook
            hookArray[existingIndex] = eventHooks[0];
        }
        else {
            // Add new hook
            hookArray.push(eventHooks[0]);
        }
    }
    return result;
}
function writeSettings(settingsPath, settings, deps) {
    const fsModule = getFs(deps);
    const dir = path_1.default.dirname(settingsPath);
    ensureDir(dir, deps);
    fsModule.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}
function runSetupSync(deps) {
    const fsModule = getFs(deps);
    const sourcePath = deps?.hookSourcePath ?? path_1.default.join(__dirname, '..', 'hooks', 'status-reporter.js');
    const destPath = deps?.hookDestPath ?? path_1.default.join(exports.COMPANION_HOOKS_DIR, 'status-reporter.js');
    const settingsPath = deps?.settingsPath ?? exports.SETTINGS_FILE;
    // Verify source exists
    if (!fsModule.existsSync(sourcePath)) {
        return {
            success: false,
            error: `Hook source not found: ${sourcePath}`
        };
    }
    // Copy hook script
    copyHookScript(sourcePath, destPath, deps);
    // Read existing settings
    let settings = {};
    let backupPath;
    if (fsModule.existsSync(settingsPath)) {
        // Create backup first
        backupPath = createBackup(settingsPath, deps);
        try {
            settings = readSettings(settingsPath, deps);
        }
        catch {
            // JSON parse failed, but backup is saved - continue with empty settings
            settings = {};
        }
    }
    // Merge hooks
    const newHooks = createHookConfig(destPath);
    const updatedSettings = mergeHooks(settings, newHooks);
    // Write settings
    writeSettings(settingsPath, updatedSettings, deps);
    return {
        success: true,
        hookPath: destPath,
        settingsPath,
        backupPath
    };
}
function askConfirmation(question, rl) {
    const rlInterface = rl ?? readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rlInterface.question(question, (answer) => {
            if (!rl) {
                rlInterface.close();
            }
            resolve(answer.toLowerCase() === 'y');
        });
    });
}
