"use strict";
/**
 * PID file utilities for managing background processes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePid = writePid;
exports.readPid = readPid;
exports.isProcessRunning = isProcessRunning;
exports.removePid = removePid;
const fs_1 = require("fs");
function writePid(pidFile, pid) {
    (0, fs_1.writeFileSync)(pidFile, String(pid));
}
function readPid(pidFile) {
    if (!(0, fs_1.existsSync)(pidFile))
        return null;
    try {
        const content = (0, fs_1.readFileSync)(pidFile, 'utf8').trim();
        if (!/^\d+$/.test(content))
            return null;
        return parseInt(content, 10);
    }
    catch {
        return null;
    }
}
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function removePid(pidFile) {
    try {
        (0, fs_1.unlinkSync)(pidFile);
    }
    catch {
        // File may not exist
    }
}
