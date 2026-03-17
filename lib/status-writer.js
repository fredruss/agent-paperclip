"use strict";
/**
 * Shared status writer for Agent Paperclip
 *
 * Writes pet status updates to ~/.agent-paperclip/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSIONS_FILE = exports.STATUS_FILE = exports.STATUS_DIR = void 0;
exports.ensureStatusDir = ensureStatusDir;
exports.writeStatus = writeStatus;
exports.sessionIdFromPath = sessionIdFromPath;
exports.writeSessionStatus = writeSessionStatus;
exports.removeSession = removeSession;
exports.clearSessions = clearSessions;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const crypto_1 = require("crypto");
exports.STATUS_DIR = (0, path_1.join)((0, os_1.homedir)(), '.agent-paperclip');
exports.STATUS_FILE = (0, path_1.join)(exports.STATUS_DIR, 'status.json');
exports.SESSIONS_FILE = (0, path_1.join)(exports.STATUS_DIR, 'sessions.json');
let writeChain = Promise.resolve();
async function ensureStatusDir() {
    if (!(0, fs_1.existsSync)(exports.STATUS_DIR)) {
        await (0, promises_1.mkdir)(exports.STATUS_DIR, { recursive: true });
    }
}
async function writeStatus(status, action, usage = null) {
    const task = writeChain.then(async () => {
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
    });
    // Keep queue processing even after a rejected write.
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
function sessionIdFromPath(path) {
    return (0, crypto_1.createHash)('sha256').update(path).digest('hex').slice(0, 8);
}
async function readSessionsFile() {
    try {
        const raw = await (0, promises_1.readFile)(exports.SESSIONS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.sessions && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions)) {
            return parsed;
        }
        return { sessions: {} };
    }
    catch {
        return { sessions: {} };
    }
}
async function writeSessionsFile(file) {
    await (0, promises_1.writeFile)(exports.SESSIONS_FILE, JSON.stringify(file, null, 2));
}
async function writeSessionStatus(sessionId, source, status, action, usage) {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        const file = await readSessionsFile();
        const now = Date.now();
        file.sessions[sessionId] = {
            sessionId,
            source,
            status,
            action,
            timestamp: file.sessions[sessionId]?.timestamp ?? now,
            lastActivity: now,
            ...(usage ? { usage } : {})
        };
        await writeSessionsFile(file);
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
async function removeSession(sessionId) {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        const file = await readSessionsFile();
        delete file.sessions[sessionId];
        await writeSessionsFile(file);
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
async function clearSessions() {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        await writeSessionsFile({ sessions: {} });
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
