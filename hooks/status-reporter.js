#!/usr/bin/env node
"use strict";
/**
 * Claude Companion Status Reporter Hook
 *
 * This script receives events from Claude Code hooks and writes
 * status updates to ~/.claude-companion/status.json
 *
 * Hook events received via stdin as JSON:
 * - UserPromptSubmit: When the user submits a prompt
 * - PreToolUse: Before a tool is used
 * - PostToolUse: After a tool completes
 * - Stop: When Claude stops responding
 * - SessionStart: When a session starts
 * - SessionEnd: When a session ends
 */
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const STATUS_DIR = (0, path_1.join)((0, os_1.homedir)(), '.claude-companion');
const STATUS_FILE = (0, path_1.join)(STATUS_DIR, 'status.json');
// Tool name to human-readable action mapping
const TOOL_ACTIONS = {
    Read: 'Reading file...',
    Write: 'Writing file...',
    Edit: 'Editing code...',
    Bash: 'Running command...',
    Glob: 'Searching files...',
    Grep: 'Searching code...',
    WebFetch: 'Fetching web page...',
    WebSearch: 'Searching the web...',
    Task: 'Working on subtask...',
    TodoWrite: 'Planning tasks...',
    AskUserQuestion: 'Has a question for you...',
    mcp__ide__getDiagnostics: 'Checking diagnostics...',
    mcp__ide__executeCode: 'Executing code...'
};
// Map tool names to pet states
const TOOL_STATES = {
    Read: 'reading',
    Glob: 'reading',
    Grep: 'reading',
    WebFetch: 'reading',
    WebSearch: 'reading',
    Write: 'working',
    Edit: 'working',
    Bash: 'working',
    Task: 'working',
    TodoWrite: 'working',
    AskUserQuestion: 'waiting',
    mcp__ide__getDiagnostics: 'reading',
    mcp__ide__executeCode: 'working'
};
async function ensureStatusDir() {
    if (!(0, fs_1.existsSync)(STATUS_DIR)) {
        await (0, promises_1.mkdir)(STATUS_DIR, { recursive: true });
    }
}
/**
 * Parse transcript JSONL file and sum up token usage
 */
async function parseTranscriptUsage(transcriptPath) {
    if (!transcriptPath || !(0, fs_1.existsSync)(transcriptPath)) {
        return null;
    }
    try {
        const content = await (0, promises_1.readFile)(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');
        let totalInput = 0;
        let totalOutput = 0;
        let totalCacheRead = 0;
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                // Usage is nested inside message.usage for assistant messages
                const usage = entry.message?.usage;
                if (usage) {
                    totalInput += usage.input_tokens || 0;
                    totalOutput += usage.output_tokens || 0;
                    totalCacheRead += usage.cache_read_input_tokens || 0;
                }
            }
            catch {
                // Skip malformed lines
            }
        }
        // Only return usage if we found any tokens
        if (totalInput === 0 && totalOutput === 0) {
            return null;
        }
        return {
            input: totalInput,
            output: totalOutput,
            cacheRead: totalCacheRead
        };
    }
    catch {
        return null;
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
    await (0, promises_1.writeFile)(STATUS_FILE, JSON.stringify(data, null, 2));
}
async function handleEvent(event) {
    const { hook_event_name, tool_name, tool_input, tool_response, user_prompt, transcript_path } = event;
    // Parse token usage from transcript (do this for most events)
    const usage = await parseTranscriptUsage(transcript_path);
    switch (hook_event_name) {
        case 'UserPromptSubmit': {
            let action = 'Thinking...';
            // Optionally show truncated prompt
            if (user_prompt && user_prompt.length > 0) {
                const truncated = user_prompt.slice(0, 30);
                action = `Thinking about: "${truncated}${user_prompt.length > 30 ? '...' : ''}"`;
            }
            await writeStatus('thinking', action, usage);
            break;
        }
        case 'PreToolUse': {
            const state = (tool_name && TOOL_STATES[tool_name]) || 'working';
            let action = (tool_name && TOOL_ACTIONS[tool_name]) || `Using ${tool_name}...`;
            // Add more context for specific tools
            if (tool_name === 'Read' && tool_input?.file_path) {
                const filename = tool_input.file_path.split('/').pop();
                action = `Reading ${filename}...`;
            }
            else if (tool_name === 'Write' && tool_input?.file_path) {
                const filename = tool_input.file_path.split('/').pop();
                action = `Writing ${filename}...`;
            }
            else if (tool_name === 'Edit' && tool_input?.file_path) {
                const filename = tool_input.file_path.split('/').pop();
                action = `Editing ${filename}...`;
            }
            else if (tool_name === 'Bash' && tool_input?.command) {
                const cmd = tool_input.command.split(' ')[0];
                action = `Running ${cmd}...`;
            }
            else if (tool_name === 'Grep' && tool_input?.pattern) {
                action = `Searching for "${tool_input.pattern.slice(0, 20)}${tool_input.pattern.length > 20 ? '...' : ''}"...`;
            }
            await writeStatus(state, action, usage);
            break;
        }
        case 'PostToolUse': {
            if (tool_response && tool_response.success === false) {
                await writeStatus('error', 'Something went wrong...', usage);
            }
            else {
                // Tool completed successfully - return to thinking state
                // This ensures we don't get stuck in "waiting" after permission granted
                await writeStatus('thinking', 'Thinking...', usage);
            }
            break;
        }
        case 'Stop': {
            // Stop event just indicates Claude finished - show "done" state
            await writeStatus('done', 'All done!', usage);
            break;
        }
        case 'SessionStart': {
            await writeStatus('idle', 'Session started!');
            break;
        }
        case 'SessionEnd': {
            await writeStatus('idle', 'Session ended', usage);
            break;
        }
        case 'Notification': {
            const { notification_type } = event;
            switch (notification_type) {
                case 'permission_prompt':
                    await writeStatus('waiting', 'Needs your permission...', usage);
                    break;
                case 'elicitation_dialog':
                    await writeStatus('waiting', 'Has a question for you...', usage);
                    break;
                case 'idle_prompt':
                    // User has been idle for 60+ seconds - just ignore
                    break;
                default:
                    // Unknown notification type, ignore
                    break;
            }
            break;
        }
        default:
            // Unknown event, ignore
            break;
    }
}
// Read JSON from stdin
async function main() {
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        input += chunk;
    }
    if (!input.trim()) {
        process.exit(0);
    }
    try {
        const event = JSON.parse(input);
        await handleEvent(event);
    }
    catch (err) {
        console.error('Failed to parse event:', err.message);
        process.exit(1);
    }
}
main().catch((err) => {
    console.error('Hook error:', err);
    process.exit(1);
});
