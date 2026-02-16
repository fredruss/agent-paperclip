#!/usr/bin/env node
"use strict";
/**
 * Agent Paperclip Status Reporter Hook
 *
 * This script receives events from Claude Code hooks and writes
 * status updates to ~/.agent-paperclip/status.json
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
exports.parseTranscript = parseTranscript;
exports.handleEvent = handleEvent;
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const status_writer_1 = require("../lib/status-writer");
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
/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 * Tries to break at word boundaries.
 */
function truncateThinking(text, maxLength = 40) {
    if (text.length <= maxLength)
        return text;
    // Try to break at a word boundary
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
        return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
}
/**
 * Parse transcript JSONL file to extract usage and thinking content.
 * Usage shows how "full" the context window is.
 * Thinking extracts Claude's internal reasoning (not user-facing responses).
 */
async function parseTranscript(transcriptPath) {
    if (!transcriptPath || !(0, fs_1.existsSync)(transcriptPath)) {
        return { usage: null, thinking: null };
    }
    try {
        const content = await (0, promises_1.readFile)(transcriptPath, 'utf8');
        const lines = content.trim().split('\n');
        let latestContext = 0;
        let latestOutput = 0;
        let latestUsageRequestId = null;
        let latestThinking = null;
        let latestThinkingRequestId = null;
        // Process lines to find usage and thinking content
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const requestId = entry.requestId || null;
                // Extract usage from message.usage
                const usage = entry.message?.usage;
                if (usage) {
                    // Context size = input + cache_creation + cache_read
                    latestContext =
                        (usage.input_tokens || 0) +
                            (usage.cache_creation_input_tokens || 0) +
                            (usage.cache_read_input_tokens || 0);
                    latestOutput = usage.output_tokens || 0;
                    latestUsageRequestId = requestId;
                }
                // Extract thinking content from message.content
                // PRIVACY: Only extract "thinking" blocks, never "text" blocks (user responses)
                const messageContent = entry.message?.content;
                if (Array.isArray(messageContent)) {
                    for (const block of messageContent) {
                        if (block.type === 'thinking' && block.thinking) {
                            latestThinking = block.thinking;
                            latestThinkingRequestId = requestId;
                        }
                    }
                }
            }
            catch {
                // Skip malformed lines
            }
        }
        // Only use thinking if it's from the same request as the latest usage
        // This prevents showing stale thinking from previous requests
        const thinkingResult = latestThinking && latestThinkingRequestId === latestUsageRequestId
            ? truncateThinking(latestThinking)
            : null;
        const usageResult = latestContext === 0 && latestOutput === 0
            ? null
            : { context: latestContext, output: latestOutput };
        return {
            usage: usageResult,
            thinking: thinkingResult
        };
    }
    catch {
        return { usage: null, thinking: null };
    }
}
async function handleEvent(event) {
    const { hook_event_name, tool_name, tool_input, tool_response, transcript_path } = event;
    // Parse token usage and thinking content from transcript
    const { usage, thinking } = await parseTranscript(transcript_path);
    switch (hook_event_name) {
        case 'UserPromptSubmit': {
            // Don't display user prompts for privacy - only show generic status
            await (0, status_writer_1.writeStatus)('thinking', 'Thinking...', usage);
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
            await (0, status_writer_1.writeStatus)(state, action, usage);
            break;
        }
        case 'PostToolUse': {
            if (tool_response && tool_response.success === false) {
                await (0, status_writer_1.writeStatus)('error', 'Something went wrong...', usage);
            }
            else {
                // Tool completed successfully - return to thinking state
                // Show actual thinking content if available
                const action = thinking ? `Thinking: "${thinking}"` : 'Thinking...';
                await (0, status_writer_1.writeStatus)('thinking', action, usage);
            }
            break;
        }
        case 'Stop': {
            // Stop event just indicates Claude finished - show "done" state
            await (0, status_writer_1.writeStatus)('done', 'All done!', usage);
            break;
        }
        case 'SessionStart': {
            await (0, status_writer_1.writeStatus)('idle', 'Session started!');
            break;
        }
        case 'SessionEnd': {
            await (0, status_writer_1.writeStatus)('idle', 'Session ended', usage);
            break;
        }
        case 'Notification': {
            const { notification_type } = event;
            switch (notification_type) {
                case 'permission_prompt':
                    await (0, status_writer_1.writeStatus)('waiting', 'Needs your permission...', usage);
                    break;
                case 'elicitation_dialog':
                    await (0, status_writer_1.writeStatus)('waiting', 'Has a question for you...', usage);
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
const isMain = typeof require !== 'undefined' && require.main === module;
// Only run when invoked directly; avoid running on import in tests.
if (isMain) {
    main().catch((err) => {
        console.error('Hook error:', err);
        process.exit(1);
    });
}
