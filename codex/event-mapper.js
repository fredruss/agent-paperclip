"use strict";
/**
 * Maps Codex session events to pet status updates.
 *
 * Pure functions, no I/O. Each function takes a parsed JSONL entry
 * and returns a pet state update or null to ignore the event.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCodexEvent = mapCodexEvent;
exports.extractUsageFromEntry = extractUsageFromEntry;
function truncateText(text, maxLength = 40) {
    if (text.length <= maxLength)
        return text;
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
        return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
}
function extractUsage(payload) {
    const info = payload.info;
    if (!info)
        return undefined;
    // Prefer last_token_usage to match Claude hook behavior (latest request usage).
    // total_token_usage is cumulative across the full Codex session and can grow very large.
    const u = info.last_token_usage ?? info.total_token_usage;
    return {
        // Codex input_tokens already includes cached tokens; adding cached_input_tokens would double-count.
        context: u.input_tokens,
        output: u.output_tokens
    };
}
function mapFunctionCall(payload) {
    const { name } = payload;
    if (name === 'exec_command' || name === 'shell_command') {
        try {
            const args = JSON.parse(payload.arguments);
            if (args.sandbox_permissions === 'require_escalated') {
                if (args.cmd) {
                    const cmd = args.cmd.split(' ')[0];
                    return { status: 'waiting', action: `Awaiting approval for ${cmd}...` };
                }
                return { status: 'waiting', action: 'Awaiting your approval...' };
            }
            if (args.cmd) {
                const cmd = args.cmd.split(' ')[0];
                return { status: 'working', action: `Running ${cmd}...` };
            }
        }
        catch {
            // Fall through to generic
        }
        return { status: 'working', action: 'Running command...' };
    }
    if (name === 'apply_patch') {
        return { status: 'working', action: 'Editing file...' };
    }
    if (name === 'read_mcp_resource') {
        return { status: 'reading', action: 'Reading resource...' };
    }
    return { status: 'working', action: `Using ${name}...` };
}
function mapCustomToolCall(payload) {
    if (payload.name === 'apply_patch') {
        return { status: 'working', action: 'Editing file...' };
    }
    return { status: 'working', action: `Using ${payload.name}...` };
}
function mapEventMsg(payload) {
    switch (payload.type) {
        case 'task_started':
            return { status: 'thinking', action: 'Thinking...' };
        case 'task_complete':
            return { status: 'done', action: 'All done!' };
        case 'user_message':
            return { status: 'thinking', action: 'Thinking...' };
        case 'agent_reasoning':
            return {
                status: 'thinking',
                action: `Thinking: "${truncateText(payload.text)}"`
            };
        case 'agent_message':
            return { status: 'thinking', action: 'Responding...' };
        case 'token_count':
            // Token count events only carry usage data, no state change
            return null;
        default:
            return null;
    }
}
function mapResponseItem(payload) {
    switch (payload.type) {
        case 'function_call':
            return mapFunctionCall(payload);
        case 'custom_tool_call':
            return mapCustomToolCall(payload);
        case 'function_call_output':
        case 'custom_tool_call_output':
            return { status: 'thinking', action: 'Thinking...' };
        case 'message':
            // Only care about assistant messages (agent responding)
            if (payload.role === 'assistant') {
                if (payload.phase === 'final_answer') {
                    return { status: 'done', action: 'All done!' };
                }
                return { status: 'thinking', action: 'Responding...' };
            }
            return null;
        case 'reasoning':
            return null;
        default:
            return null;
    }
}
function mapCodexEvent(entry) {
    switch (entry.type) {
        case 'session_meta':
            return { status: 'idle', action: 'Codex session started!' };
        case 'turn_context':
            return null;
        case 'event_msg':
            return mapEventMsg(entry.payload);
        case 'response_item':
            return mapResponseItem(entry.payload);
        default:
            return null;
    }
}
/**
 * Extract usage from a token_count event_msg, if present.
 */
function extractUsageFromEntry(entry) {
    if (entry.type !== 'event_msg')
        return undefined;
    const payload = entry.payload;
    if (payload.type !== 'token_count')
        return undefined;
    return extractUsage(payload);
}
