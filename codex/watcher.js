#!/usr/bin/env node
"use strict";
/**
 * Codex Watcher for Agent Paperclip
 *
 * Long-lived process that tails Codex session files and writes
 * pet status updates to ~/.agent-paperclip/status.json.
 *
 * Launched automatically by `agent-paperclip` when ~/.codex/ exists.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventHandler = createEventHandler;
const fs_1 = require("fs");
const chokidar_1 = require("chokidar");
const status_writer_1 = require("../lib/status-writer");
const session_finder_1 = require("./session-finder");
const session_watcher_1 = require("./session-watcher");
const event_mapper_1 = require("./event-mapper");
const debug = !!process.env.COMPANION_DEBUG;
let watcher = null;
function createEventHandler() {
    const usageBySession = new Map();
    return function handleEvent(entry, sessionFile) {
        const sessionId = (0, status_writer_1.sessionIdFromPath)(sessionFile);
        if (debug) {
            const subtype = entry.type === 'event_msg' || entry.type === 'response_item'
                ? ` (${entry.payload?.type})`
                : '';
            console.error(`[watcher] event: ${entry.type}${subtype} (session=${sessionId})`);
        }
        // A new session starts with session_meta; clear usage for this session.
        if (entry.type === 'session_meta') {
            usageBySession.delete(sessionId);
        }
        // Track usage from token_count events
        const usage = (0, event_mapper_1.extractUsageFromEntry)(entry);
        if (usage)
            usageBySession.set(sessionId, usage);
        // Mirror Codex's rate limits to usage.json so the badge can render.
        const rateSnapshot = (0, event_mapper_1.extractRateLimitsFromEntry)(entry);
        if (rateSnapshot) {
            (0, status_writer_1.writeUsage)(rateSnapshot).catch((err) => {
                console.error(`[watcher] writeUsage failed:`, err);
            });
        }
        // Map to pet state
        const update = (0, event_mapper_1.mapCodexEvent)(entry);
        if (!update)
            return;
        const sessionUsage = update.usage ?? usageBySession.get(sessionId);
        if (debug)
            console.error(`[watcher] -> ${update.status}: ${update.action}`);
        // Write to sessions.json for multi-session support
        (0, status_writer_1.writeSessionStatus)(sessionId, 'codex', update.status, update.action, sessionUsage)
            .catch((err) => {
            console.error(`[watcher] writeSessionStatus failed:`, err);
        });
        // Also write legacy status.json for backward compat
        (0, status_writer_1.writeStatus)(update.status, update.action, sessionUsage ?? null)
            .catch((err) => {
            console.error(`[watcher] writeStatus failed:`, err);
        });
        // Clean up session on task_complete
        if (entry.type === 'event_msg' && entry.payload.type === 'task_complete') {
            usageBySession.delete(sessionId);
            (0, status_writer_1.removeSession)(sessionId).catch((err) => {
                console.error(`[watcher] removeSession failed:`, err);
            });
        }
    };
}
const handleEvent = createEventHandler();
async function startSessionWatching() {
    const sessionFile = await (0, session_finder_1.findLatestSession)();
    if (sessionFile) {
        if (debug)
            console.error(`[watcher] watching session: ${sessionFile}`);
        watcher = await (0, session_watcher_1.watchSession)(sessionFile, handleEvent);
    }
    else {
        if (debug)
            console.error('[watcher] no session found, waiting for first session...');
        watcher = await (0, session_watcher_1.watchForFirstSession)(handleEvent);
    }
}
async function start() {
    if (debug)
        console.error(`[watcher] starting, platform=${process.platform}, CODEX_HOME=${session_finder_1.CODEX_HOME}, SESSIONS_DIR=${session_finder_1.SESSIONS_DIR}`);
    if ((0, fs_1.existsSync)(session_finder_1.SESSIONS_DIR)) {
        if (debug)
            console.error('[watcher] sessions dir exists');
        await startSessionWatching();
        return;
    }
    // Sessions directory doesn't exist yet - watch for it to appear
    if (!(0, fs_1.existsSync)(session_finder_1.CODEX_HOME)) {
        if (debug)
            console.error('[watcher] no ~/.codex, exiting');
        process.exit(0);
    }
    const dirWatcher = (0, chokidar_1.watch)(session_finder_1.CODEX_HOME, {
        persistent: true,
        depth: 0,
        ignoreInitial: true,
        ...(process.platform === 'win32' ? { usePolling: true, interval: session_watcher_1.WINDOWS_POLL_INTERVAL_MS } : {})
    });
    if (debug)
        console.error(`[watcher] waiting for sessions dir to appear under ${session_finder_1.CODEX_HOME}`);
    dirWatcher.on('addDir', async (dirPath) => {
        if (debug)
            console.error(`[watcher] directory added: ${dirPath}`);
        if (dirPath === session_finder_1.SESSIONS_DIR) {
            await dirWatcher.close();
            await startSessionWatching();
        }
    });
    // Re-check after watcher is set up to close the race window
    if ((0, fs_1.existsSync)(session_finder_1.SESSIONS_DIR)) {
        await dirWatcher.close();
        await startSessionWatching();
    }
}
async function shutdown() {
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
    process.exit(0);
}
process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
start().catch((err) => {
    console.error('Codex watcher error:', err);
    process.exit(1);
});
