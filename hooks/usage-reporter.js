#!/usr/bin/env node
"use strict";
/**
 * Agent Paperclip Usage Reporter (statusLine wrapper)
 *
 * Claude Code invokes this script as the configured statusLine command,
 * passing a JSON payload on stdin. We extract the 5-hour rate-limit data
 * (Pro/Max only) and write it to ~/.agent-paperclip/usage.json so the
 * Electron app can render an idle-state usage badge.
 *
 * If the user had a pre-existing statusLine, setup records it in
 * ~/.agent-paperclip/wrapped-statusline.json; we spawn that command
 * with the same stdin and forward its stdout so the original still renders.
 *
 * Errors must never fail the statusLine — on any failure we print empty
 * and exit 0 so Claude Code's UI stays clean.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUsage = extractUsage;
exports.main = main;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const HOME = os_1.default.homedir();
const COMPANION_DIR = path_1.default.join(HOME, '.agent-paperclip');
const USAGE_FILE = path_1.default.join(COMPANION_DIR, 'usage.json');
const WRAPPED_FILE = path_1.default.join(COMPANION_DIR, 'wrapped-statusline.json');
function extractUsage(payload) {
    const fiveHour = payload?.rate_limits?.five_hour;
    if (!fiveHour)
        return null;
    const { used_percentage, resets_at } = fiveHour;
    if (typeof used_percentage !== 'number' || typeof resets_at !== 'number') {
        return null;
    }
    return {
        source: 'claude-code',
        usedPercentage: used_percentage,
        resetsAt: resets_at,
        updatedAt: Math.floor(Date.now() / 1000)
    };
}
function writeUsageAtomically(snapshot) {
    if (!fs_1.default.existsSync(COMPANION_DIR)) {
        fs_1.default.mkdirSync(COMPANION_DIR, { recursive: true });
    }
    const tmp = `${USAGE_FILE}.tmp-${process.pid}`;
    fs_1.default.writeFileSync(tmp, JSON.stringify(snapshot));
    fs_1.default.renameSync(tmp, USAGE_FILE);
}
function clearUsage() {
    try {
        fs_1.default.rmSync(USAGE_FILE, { force: true });
    }
    catch {
        // Best-effort: never fail the statusLine
    }
}
function readWrappedStatusLine() {
    try {
        if (!fs_1.default.existsSync(WRAPPED_FILE))
            return null;
        const content = fs_1.default.readFileSync(WRAPPED_FILE, 'utf8');
        const parsed = JSON.parse(content);
        if (!parsed.command)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function forwardWrappedStatusLine(wrapped, stdin) {
    try {
        const result = (0, child_process_1.spawnSync)(wrapped.command, {
            input: stdin,
            shell: true,
            encoding: 'utf8',
            timeout: 5000
        });
        return result.stdout ?? '';
    }
    catch {
        return '';
    }
}
async function readStdin() {
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        input += chunk;
    }
    return input;
}
async function main() {
    let input = '';
    try {
        input = await readStdin();
    }
    catch {
        process.stdout.write('');
        return;
    }
    if (input.trim()) {
        try {
            const payload = JSON.parse(input);
            const snapshot = extractUsage(payload);
            if (snapshot) {
                try {
                    writeUsageAtomically(snapshot);
                }
                catch {
                    // Swallow write errors — never fail the statusLine
                }
            }
            else {
                // Successful parse but no five_hour data: clear any stale snapshot
                // so a previous session's badge doesn't linger on free tier or
                // before the first Claude response of a new session.
                clearUsage();
            }
        }
        catch {
            // Malformed stdin — continue so a wrapped statusLine still runs
        }
    }
    const wrapped = readWrappedStatusLine();
    const output = wrapped ? forwardWrappedStatusLine(wrapped, input) : '';
    process.stdout.write(output);
}
const isMain = typeof require !== 'undefined' && require.main === module;
if (isMain) {
    main().catch(() => {
        process.stdout.write('');
        process.exit(0);
    });
}
