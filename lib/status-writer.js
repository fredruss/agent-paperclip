"use strict";
/**
 * Shared status writer for Claude Companion
 *
 * Writes pet status updates to ~/.claude-companion/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_FILE = exports.STATUS_DIR = void 0;
exports.ensureStatusDir = ensureStatusDir;
exports.writeStatus = writeStatus;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
exports.STATUS_DIR = (0, path_1.join)((0, os_1.homedir)(), '.claude-companion');
exports.STATUS_FILE = (0, path_1.join)(exports.STATUS_DIR, 'status.json');
async function ensureStatusDir() {
    if (!(0, fs_1.existsSync)(exports.STATUS_DIR)) {
        await (0, promises_1.mkdir)(exports.STATUS_DIR, { recursive: true });
    }
}
async function writeStatus(status, action, usage = null) {
    await ensureStatusDir();
    const data = {
        status,
        action,
        timestamp: Date.now()
    };
    if (usage) {
        data.usage = usage;
    }
    await (0, promises_1.writeFile)(exports.STATUS_FILE, JSON.stringify(data, null, 2));
}
