"use strict";
/**
 * Watches a Codex session file for new JSONL entries.
 *
 * Uses chokidar to detect file changes, then reads only the new content
 * appended since the last read. Detects new session files and switches
 * to watching them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonlChunk = parseJsonlChunk;
exports.watchSession = watchSession;
exports.watchForFirstSession = watchForFirstSession;
const promises_1 = require("fs/promises");
const chokidar_1 = require("chokidar");
const session_finder_1 = require("./session-finder");
const debug = !!process.env.COMPANION_DEBUG;
/**
 * Parse a chunk of JSONL text while preserving incomplete trailing lines.
 */
function parseJsonlChunk(chunk, previousRemainder = '') {
    const combined = previousRemainder + chunk;
    const lines = combined.split('\n');
    let remainder = lines.pop() ?? '';
    const entries = [];
    for (const line of lines) {
        if (!line.trim())
            continue;
        try {
            entries.push(JSON.parse(line));
        }
        catch {
            // Skip malformed lines.
        }
    }
    // Handle JSONL files that may not end with a newline.
    if (remainder.trim()) {
        try {
            entries.push(JSON.parse(remainder));
            remainder = '';
        }
        catch {
            // Keep incomplete trailing JSON for the next read.
        }
    }
    return { entries, remainder };
}
/**
 * Start watching a session file for new events.
 * Calls onEvent for each new JSONL entry appended to the file.
 * Also watches the sessions directory for new session files and switches automatically.
 */
async function watchSession(sessionFile, onEvent) {
    let currentFile = sessionFile;
    let watchedPath = sessionFile;
    let offset = 0;
    let reading = false;
    let dirty = false;
    let lineRemainder = '';
    // Start from current file size (don't replay old events)
    try {
        const fileStat = await (0, promises_1.stat)(currentFile);
        offset = fileStat.size;
    }
    catch {
        offset = 0;
    }
    async function readNewContent() {
        if (reading) {
            dirty = true;
            return;
        }
        reading = true;
        dirty = false;
        try {
            const fileStat = await (0, promises_1.stat)(currentFile);
            if (fileStat.size <= offset)
                return;
            const fd = await (0, promises_1.open)(currentFile, 'r');
            try {
                const buf = Buffer.alloc(fileStat.size - offset);
                await fd.read(buf, 0, buf.length, offset);
                offset = fileStat.size;
                const newContent = buf.toString('utf8');
                if (debug)
                    console.error(`[session-watcher] read ${buf.length} new bytes`);
                const parsed = parseJsonlChunk(newContent, lineRemainder);
                lineRemainder = parsed.remainder;
                if (debug)
                    console.error(`[session-watcher] parsed ${parsed.entries.length} entries`);
                for (const entry of parsed.entries) {
                    onEvent(entry);
                }
            }
            finally {
                await fd.close();
            }
        }
        catch {
            // File may have been removed or rotated
        }
        finally {
            reading = false;
            if (dirty) {
                dirty = false;
                readNewContent();
            }
        }
    }
    // Watch the current session file for changes
    const usePolling = process.platform === 'win32';
    const fileWatcher = (0, chokidar_1.watch)(currentFile, {
        persistent: true,
        ...(usePolling && { usePolling: true, interval: 500 })
    });
    fileWatcher.on('change', () => {
        if (debug)
            console.error(`[session-watcher] change detected in ${currentFile}`);
        readNewContent();
    });
    // Watch the sessions directory for new session files
    let dirWatcher = null;
    try {
        dirWatcher = (0, chokidar_1.watch)(session_finder_1.SESSIONS_DIR, {
            persistent: true,
            depth: 3,
            ignoreInitial: true
        });
        dirWatcher.on('add', (newPath) => {
            if (newPath.endsWith('.jsonl') && newPath.includes('rollout-')) {
                // Switch to watching the new session file
                const oldPath = watchedPath;
                currentFile = newPath;
                watchedPath = newPath;
                offset = 0;
                lineRemainder = '';
                fileWatcher.unwatch(oldPath);
                fileWatcher.add(newPath);
                readNewContent();
            }
        });
    }
    catch {
        // Sessions directory may not exist yet
    }
    return {
        async close() {
            await fileWatcher.close();
            if (dirWatcher)
                await dirWatcher.close();
        }
    };
}
/**
 * Watch the sessions directory for the first session file to appear.
 * Returns a watcher that calls onEvent when events arrive.
 */
async function watchForFirstSession(onEvent) {
    let sessionWatcher = null;
    let found = false;
    const dirWatcher = (0, chokidar_1.watch)(session_finder_1.SESSIONS_DIR, {
        persistent: true,
        depth: 3,
        ignoreInitial: true
    });
    dirWatcher.on('add', async (newPath) => {
        if (found)
            return;
        if (newPath.endsWith('.jsonl') && newPath.includes('rollout-')) {
            found = true;
            // Found the first session file - switch to session watching
            await dirWatcher.close();
            sessionWatcher = await watchSession(newPath, onEvent);
        }
    });
    return {
        async close() {
            if (sessionWatcher) {
                await sessionWatcher.close();
            }
            else {
                await dirWatcher.close();
            }
        }
    };
}
