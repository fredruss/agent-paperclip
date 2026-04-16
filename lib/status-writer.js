"use strict";
/**
 * Shared status writer for Agent Paperclip
 *
 * Writes pet status updates to ~/.agent-paperclip/status.json.
 * Used by both the Claude Code hook reporter and the Codex watcher.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.USAGE_FILE = exports.SESSIONS_FILE = exports.STATUS_FILE = exports.STATUS_DIR = void 0;
exports.ensureStatusDir = ensureStatusDir;
exports.writeStatus = writeStatus;
exports.sessionIdFromPath = sessionIdFromPath;
exports.writeSessionStatus = writeSessionStatus;
exports.removeSession = removeSession;
exports.writeUsage = writeUsage;
exports.clearSessions = clearSessions;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const crypto_1 = require("crypto");
exports.STATUS_DIR = (0, path_1.join)((0, os_1.homedir)(), '.agent-paperclip');
exports.STATUS_FILE = (0, path_1.join)(exports.STATUS_DIR, 'status.json');
exports.SESSIONS_FILE = (0, path_1.join)(exports.STATUS_DIR, 'sessions.json');
exports.USAGE_FILE = (0, path_1.join)(exports.STATUS_DIR, 'usage.json');
const SESSIONS_LOCK_FILE = `${exports.SESSIONS_FILE}.lock`;
const SESSIONS_LOCK_RETRY_MS = 50;
const SESSIONS_LOCK_TIMEOUT_MS = 5_000;
const SESSIONS_LOCK_STALE_MS = 30_000;
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function isStaleLockFile() {
    try {
        const lockStats = await (0, promises_1.stat)(SESSIONS_LOCK_FILE);
        return Date.now() - lockStats.mtimeMs > SESSIONS_LOCK_STALE_MS;
    }
    catch {
        return false;
    }
}
async function acquireSessionsLock() {
    const deadline = Date.now() + SESSIONS_LOCK_TIMEOUT_MS;
    while (true) {
        try {
            const handle = await (0, promises_1.open)(SESSIONS_LOCK_FILE, 'wx');
            await handle.close();
            return async () => {
                await (0, promises_1.rm)(SESSIONS_LOCK_FILE, { force: true });
            };
        }
        catch (error) {
            const code = error.code;
            if (code !== 'EEXIST') {
                throw error;
            }
            if (await isStaleLockFile()) {
                await (0, promises_1.rm)(SESSIONS_LOCK_FILE, { force: true });
                continue;
            }
            if (Date.now() >= deadline) {
                throw new Error(`Timed out acquiring sessions lock: ${SESSIONS_LOCK_FILE}`);
            }
            await sleep(SESSIONS_LOCK_RETRY_MS);
        }
    }
}
async function writeSessionsFile(file) {
    const tempFile = `${exports.SESSIONS_FILE}.${process.pid}.${Date.now()}.tmp`;
    let renamed = false;
    try {
        await (0, promises_1.writeFile)(tempFile, JSON.stringify(file, null, 2));
        await (0, promises_1.rename)(tempFile, exports.SESSIONS_FILE);
        renamed = true;
    }
    finally {
        if (!renamed) {
            await (0, promises_1.rm)(tempFile, { force: true }).catch(() => {
                // noop
            });
        }
    }
}
async function updateSessionsFile(update) {
    const releaseLock = await acquireSessionsLock();
    try {
        const file = await readSessionsFile();
        update(file);
        await writeSessionsFile(file);
    }
    finally {
        await releaseLock();
    }
}
async function writeSessionStatus(sessionId, source, status, action, usage) {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        await updateSessionsFile((file) => {
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
        });
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
async function removeSession(sessionId) {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        await updateSessionsFile((file) => {
            delete file.sessions[sessionId];
        });
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
async function writeUsage(snapshot) {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        const tempFile = `${exports.USAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
        let renamed = false;
        try {
            await (0, promises_1.writeFile)(tempFile, JSON.stringify(snapshot));
            await (0, promises_1.rename)(tempFile, exports.USAGE_FILE);
            renamed = true;
        }
        finally {
            if (!renamed) {
                await (0, promises_1.rm)(tempFile, { force: true }).catch(() => {
                    // noop
                });
            }
        }
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
async function clearSessions() {
    const task = writeChain.then(async () => {
        await ensureStatusDir();
        await updateSessionsFile((file) => {
            file.sessions = {};
        });
    });
    writeChain = task.catch(() => {
        // noop
    });
    await task;
}
