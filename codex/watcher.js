#!/usr/bin/env node
"use strict";
/**
 * Codex Companion Watcher
 *
 * Long-lived process that tails Codex session files and writes
 * pet status updates to ~/.claude-companion/status.json.
 *
 * Launched automatically by `claude-companion` when ~/.codex/ exists.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const chokidar_1 = require("chokidar");
const status_writer_1 = require("../lib/status-writer");
const session_finder_1 = require("./session-finder");
const session_watcher_1 = require("./session-watcher");
const event_mapper_1 = require("./event-mapper");
const debug = !!process.env.COMPANION_DEBUG;
let watcher = null;
let latestUsage;
function handleEvent(entry) {
    if (debug) {
        const subtype = entry.type === 'event_msg' || entry.type === 'response_item'
            ? ` (${entry.payload?.type})`
            : '';
        console.error(`[watcher] event: ${entry.type}${subtype}`);
    }
    // A new session starts with session_meta; clear usage from any previous session.
    if (entry.type === 'session_meta') {
        latestUsage = undefined;
    }
    // Track usage from token_count events
    const usage = (0, event_mapper_1.extractUsageFromEntry)(entry);
    if (usage)
        latestUsage = usage;
    // Map to pet state
    const update = (0, event_mapper_1.mapCodexEvent)(entry);
    if (!update)
        return;
    if (debug)
        console.error(`[watcher] -> ${update.status}: ${update.action}`);
    (0, status_writer_1.writeStatus)(update.status, update.action, update.usage ?? latestUsage ?? null)
        .catch((err) => {
        console.error(`[watcher] writeStatus failed:`, err);
    });
}
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
        console.error(`[watcher] starting, SESSIONS_DIR=${session_finder_1.SESSIONS_DIR}`);
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
    const dirWatcher = (0, chokidar_1.watch)(session_finder_1.CODEX_HOME, { persistent: true, depth: 0, ignoreInitial: true });
    dirWatcher.on('addDir', async (dirPath) => {
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
