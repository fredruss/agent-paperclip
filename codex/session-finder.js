"use strict";
/**
 * Finds the latest active Codex session file.
 *
 * Codex writes session data to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 * This module scans that directory tree for the most recently modified file.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSIONS_DIR = exports.CODEX_HOME = void 0;
exports.findLatestSession = findLatestSession;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
exports.CODEX_HOME = (0, path_1.join)((0, os_1.homedir)(), '.codex');
exports.SESSIONS_DIR = (0, path_1.join)(exports.CODEX_HOME, 'sessions');
/**
 * Find the latest Codex session file by walking the date-based directory tree.
 * Returns the path to the most recently modified rollout JSONL file, or null.
 */
async function findLatestSession() {
    if (!(0, fs_1.existsSync)(exports.SESSIONS_DIR))
        return null;
    try {
        // Walk year/month/day directories in reverse order to find newest first
        const years = await (0, promises_1.readdir)(exports.SESSIONS_DIR);
        const sortedYears = years.filter(isNumericDir).sort().reverse();
        for (const year of sortedYears) {
            const yearDir = (0, path_1.join)(exports.SESSIONS_DIR, year);
            const months = await (0, promises_1.readdir)(yearDir);
            const sortedMonths = months.filter(isNumericDir).sort().reverse();
            for (const month of sortedMonths) {
                const monthDir = (0, path_1.join)(yearDir, month);
                const days = await (0, promises_1.readdir)(monthDir);
                const sortedDays = days.filter(isNumericDir).sort().reverse();
                for (const day of sortedDays) {
                    const dayDir = (0, path_1.join)(monthDir, day);
                    const files = await (0, promises_1.readdir)(dayDir);
                    const rollouts = files.filter(f => f.startsWith('rollout-') && f.endsWith('.jsonl'));
                    if (rollouts.length === 0)
                        continue;
                    // Find the most recently modified file in this day directory
                    let latestFile = null;
                    let latestMtime = 0;
                    for (const file of rollouts) {
                        const filePath = (0, path_1.join)(dayDir, file);
                        const fileStat = await (0, promises_1.stat)(filePath);
                        if (fileStat.mtimeMs > latestMtime) {
                            latestMtime = fileStat.mtimeMs;
                            latestFile = filePath;
                        }
                    }
                    if (latestFile)
                        return latestFile;
                }
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
function isNumericDir(name) {
    return /^\d+$/.test(name);
}
