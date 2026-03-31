"use strict";
/**
 * Multi-session simulator for testing the Electron app's file-watching,
 * aggregation, and rendering pipeline with fake session data.
 *
 * Usage:
 *   npm run simulate list                    # List available scenarios
 *   npm run simulate two-sessions            # Run a predefined scenario
 *   npm run simulate interactive             # Manual control mode
 *
 * Run alongside `npm run dev:debug` in another terminal to observe behavior.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const status_writer_1 = require("../lib/status-writer");
const promises_1 = require("fs/promises");
const readline_1 = require("readline");
// ── Helpers ──────────────────────────────────────────────────────────────────
const startTime = Date.now();
function timestamp() {
    const elapsed = Date.now() - startTime;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    const ms = elapsed % 1000;
    return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`;
}
function log(sessionId, source, status, action) {
    console.log(`${timestamp()} ${sessionId.padEnd(12)} ${source.padEnd(12)} ${status.padEnd(10)} "${action}"`);
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runSteps(steps) {
    for (const step of steps) {
        switch (step.type) {
            case 'write':
                log(step.sessionId, step.source, step.status, step.action);
                await writeSession(step);
                break;
            case 'remove':
                log(step.sessionId, '', 'REMOVE', '');
                await (0, status_writer_1.removeSession)(step.sessionId);
                break;
            case 'legacy':
                log('(legacy)', '', step.status, step.action);
                await (0, status_writer_1.writeStatus)(step.status, step.action);
                break;
            case 'delay':
                await sleep(step.ms);
                break;
        }
    }
}
async function readSessionsSnapshot() {
    try {
        const raw = await (0, promises_1.readFile)(status_writer_1.SESSIONS_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return { sessions: {} };
    }
}
async function writeSession(step) {
    if (!step.ageMs) {
        await (0, status_writer_1.writeSessionStatus)(step.sessionId, step.source, step.status, step.action);
        return;
    }
    await (0, status_writer_1.ensureStatusDir)();
    const sessions = await readSessionsSnapshot();
    const now = Date.now();
    const activityTime = now - step.ageMs;
    sessions.sessions[step.sessionId] = {
        sessionId: step.sessionId,
        source: step.source,
        status: step.status,
        action: step.action,
        timestamp: sessions.sessions[step.sessionId]?.timestamp ?? activityTime,
        lastActivity: activityTime
    };
    await (0, promises_1.writeFile)(status_writer_1.SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
// ── Scenarios ────────────────────────────────────────────────────────────────
const scenarios = {
    'two-sessions': {
        description: 'Basic overlap: Claude starts, Codex joins, Claude finishes, Codex finishes',
        steps: [
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Reading file.ts...' },
            { type: 'delay', ms: 1500 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'reading', action: 'Searching codebase...' },
            { type: 'delay', ms: 1000 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'working', action: 'Running tests...' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'done', action: 'All done!' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'claude1' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'done', action: 'Tests passed!' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'codex1' },
        ],
    },
    'claude-finishes-first': {
        description: 'Primary should switch to remaining active Codex session',
        steps: [
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Editing index.ts...' },
            { type: 'delay', ms: 1000 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'working', action: 'Installing dependencies...' },
            { type: 'delay', ms: 1500 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'done', action: 'Edit complete' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'claude1' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'reading', action: 'Analyzing output...' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'done', action: 'All tasks complete' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'codex1' },
        ],
    },
    'rapid-state-changes': {
        description: 'Coalescer dedup under rapid writes (100ms intervals)',
        steps: [
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Step 1' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'reading', action: 'Step 2' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Step 3' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'working', action: 'Codex step 1' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'reading', action: 'Step 4' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'reading', action: 'Codex step 2' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Step 5' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'working', action: 'Codex step 3' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'done', action: 'Done' },
            { type: 'delay', ms: 100 },
            { type: 'write', sessionId: 'codex1', source: 'codex', status: 'done', action: 'Done' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'claude1' },
            { type: 'remove', sessionId: 'codex1' },
        ],
    },
    'stale-recovery': {
        description: 'Backdated stale session is ignored until a fresh session arrives',
        steps: [
            { type: 'write', sessionId: 'stale1', source: 'claude-code', status: 'working', action: 'Started long ago...', ageMs: 31_000 },
            { type: 'delay', ms: 500 },
            { type: 'write', sessionId: 'fresh1', source: 'codex', status: 'working', action: 'Fresh session here!' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'stale1', source: 'claude-code', status: 'done', action: 'Finally done' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'stale1' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'fresh1', source: 'codex', status: 'done', action: 'All good' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'fresh1' },
        ],
    },
    'permission-prompt': {
        description: 'Claude enters waiting state, then resumes',
        steps: [
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Writing code...' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'waiting', action: 'Waiting for permission...' },
            { type: 'delay', ms: 4000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Permission granted, continuing...' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'done', action: 'Task complete' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'claude1' },
        ],
    },
    'error-recovery': {
        description: 'Error state → recovery → done',
        steps: [
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Running build...' },
            { type: 'delay', ms: 1500 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'error', action: 'Build failed!' },
            { type: 'delay', ms: 3000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Fixing errors...' },
            { type: 'delay', ms: 2000 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'working', action: 'Retrying build...' },
            { type: 'delay', ms: 1500 },
            { type: 'write', sessionId: 'claude1', source: 'claude-code', status: 'done', action: 'Build succeeded!' },
            { type: 'delay', ms: 500 },
            { type: 'remove', sessionId: 'claude1' },
        ],
    },
};
// ── Interactive mode ─────────────────────────────────────────────────────────
async function printSessions() {
    try {
        const raw = await (0, promises_1.readFile)(status_writer_1.SESSIONS_FILE, 'utf-8');
        console.log(raw);
    }
    catch {
        console.log('(no sessions file)');
    }
}
async function interactive() {
    console.log('Interactive mode. Commands:');
    console.log('  add <id> <claude-code|codex> <state> <action...>');
    console.log('  remove <id>');
    console.log('  status');
    console.log('  clear');
    console.log('  quit');
    console.log();
    const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    const prompt = () => {
        rl.question('> ', async (line) => {
            const parts = line.trim().split(/\s+/);
            const cmd = parts[0];
            switch (cmd) {
                case 'add': {
                    const [, id, source, status, ...rest] = parts;
                    if (!id || !source || !status) {
                        console.log('Usage: add <id> <claude-code|codex> <state> <action...>');
                        break;
                    }
                    const action = rest.join(' ') || status;
                    log(id, source, status, action);
                    await (0, status_writer_1.writeSessionStatus)(id, source, status, action);
                    break;
                }
                case 'remove': {
                    const id = parts[1];
                    if (!id) {
                        console.log('Usage: remove <id>');
                        break;
                    }
                    log(id, '', 'REMOVE', '');
                    await (0, status_writer_1.removeSession)(id);
                    break;
                }
                case 'status':
                    await printSessions();
                    break;
                case 'clear':
                    await (0, status_writer_1.clearSessions)();
                    await (0, status_writer_1.writeStatus)('idle', 'Cleared by simulator');
                    console.log('Cleared.');
                    break;
                case 'quit':
                case 'exit':
                    rl.close();
                    return;
                case '':
                    break;
                default:
                    console.log(`Unknown command: ${cmd}`);
            }
            prompt();
        });
    };
    prompt();
}
// ── CLI ──────────────────────────────────────────────────────────────────────
async function main() {
    const command = process.argv[2];
    if (!command || command === 'list') {
        console.log('Available scenarios:\n');
        for (const [name, scenario] of Object.entries(scenarios)) {
            console.log(`  ${name.padEnd(25)} ${scenario.description}`);
        }
        console.log(`\n  ${'interactive'.padEnd(25)} Manual control mode`);
        console.log('\nUsage: npm run simulate <scenario>');
        return;
    }
    if (command === 'interactive') {
        await interactive();
        return;
    }
    const scenario = scenarios[command];
    if (!scenario) {
        console.error(`Unknown scenario: ${command}`);
        console.error('Run "npm run simulate list" to see available scenarios.');
        process.exit(1);
    }
    console.log(`Running scenario: ${command}`);
    console.log(`${scenario.description}\n`);
    await runSteps(scenario.steps);
    console.log(`\n${timestamp()} Scenario complete.`);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
