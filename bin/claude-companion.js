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
exports.stopApp = stopApp;
exports.stopAppWindows = stopAppWindows;
exports.stopAppUnix = stopAppUnix;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const setup_1 = require("../lib/setup");
const pid_1 = require("../lib/pid");
const session_finder_1 = require("../codex/session-finder");
const CODEX_WATCHER_PID_FILE = path_1.default.join(setup_1.COMPANION_DIR, 'codex-watcher.pid');
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
function isCodexWatcher(pid) {
    try {
        const cmd = process.platform === 'win32'
            ? (0, child_process_1.execSync)(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId = ${pid}\\").CommandLine"`, { encoding: 'utf-8' }).trim()
            : (0, child_process_1.execSync)(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim();
        const normalized = cmd.replaceAll('\\', '/').toLowerCase();
        return normalized.includes('codex/watcher.js');
    }
    catch {
        return false;
    }
}
function launchCodexWatcher() {
    // Skip if Codex isn't installed
    if (!(0, fs_1.existsSync)(session_finder_1.CODEX_HOME))
        return;
    // Skip if already running (verify it's actually our watcher, not a stale PID)
    const existingPid = (0, pid_1.readPid)(CODEX_WATCHER_PID_FILE);
    if (existingPid && (0, pid_1.isProcessRunning)(existingPid) && isCodexWatcher(existingPid))
        return;
    const watcherPath = path_1.default.join(__dirname, '..', 'codex', 'watcher.js');
    if (!(0, fs_1.existsSync)(watcherPath))
        return;
    const child = (0, child_process_1.spawn)(process.execPath, [watcherPath], {
        detached: true,
        stdio: 'ignore'
    });
    if (child.pid) {
        (0, pid_1.writePid)(CODEX_WATCHER_PID_FILE, child.pid);
    }
    child.unref();
}
function stopCodexWatcher() {
    const pid = (0, pid_1.readPid)(CODEX_WATCHER_PID_FILE);
    if (!pid)
        return;
    // Only kill if the process is actually our watcher
    if ((0, pid_1.isProcessRunning)(pid) && isCodexWatcher(pid)) {
        try {
            process.kill(pid, 'SIGTERM');
        }
        catch {
            // Process may have already exited
        }
    }
    (0, pid_1.removePid)(CODEX_WATCHER_PID_FILE);
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
    // Also start the Codex watcher if Codex is installed
    launchCodexWatcher();
    console.log('Claude Code Companion launched!');
}
function stopApp() {
    if (process.platform === 'win32') {
        stopAppWindows();
    }
    else {
        stopAppUnix();
    }
    stopCodexWatcher();
}
function stopAppWindows() {
    try {
        // Pattern matches both local dev (claude-companion) and npm-installed (claude-code-companion)
        const pattern = '*companion*out*main*index.js*';
        // Use PowerShell to find electron processes (replacement for deprecated wmic)
        const findScript = `Get-CimInstance Win32_Process | ` +
            `Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '${pattern}' } | ` +
            `Select-Object -ExpandProperty ProcessId`;
        const output = (0, child_process_1.execSync)(`powershell -NoProfile -Command "${findScript}"`, {
            encoding: 'utf-8'
        }).trim();
        if (!output) {
            console.log('Claude Code Companion is not running.');
            return;
        }
        // Kill each process with taskkill
        const pids = output.split(/\r?\n/).filter((p) => p.trim());
        for (const pid of pids) {
            try {
                (0, child_process_1.execSync)(`taskkill /F /PID ${pid.trim()}`, { stdio: 'ignore' });
            }
            catch {
                // Ignore errors - child processes may already be terminated
            }
        }
        console.log('Claude Code Companion stopped.');
    }
    catch {
        console.log('Claude Code Companion is not running.');
    }
}
function stopAppUnix() {
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
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
    main().catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    });
}
