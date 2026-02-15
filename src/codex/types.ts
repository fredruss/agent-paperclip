/**
 * Codex CLI session event types
 *
 * Based on the JSONL rollout format written to ~/.codex/sessions/.
 * These types are Codex-specific and intentionally separate from shared types.
 */

// Top-level event wrapper - every line in a rollout JSONL file
export interface CodexRolloutEntry {
  timestamp: string
  type: 'session_meta' | 'turn_context' | 'event_msg' | 'response_item'
  payload: SessionMetaPayload | TurnContextPayload | EventMsgPayload | ResponseItemPayload
}

// session_meta - first line of each session
export interface SessionMetaPayload {
  id: string
  timestamp: string
  cwd: string
  cli_version: string
  model_provider?: string
  [key: string]: unknown
}

// turn_context - emitted at the start of each turn
export interface TurnContextPayload {
  cwd: string
  model: string
  approval_policy?: string
  [key: string]: unknown
}

// event_msg subtypes
export type EventMsgPayload =
  | UserMessagePayload
  | AgentMessagePayload
  | AgentReasoningPayload
  | TokenCountPayload

export interface UserMessagePayload {
  type: 'user_message'
  message: string
}

export interface AgentMessagePayload {
  type: 'agent_message'
  message: string
}

export interface AgentReasoningPayload {
  type: 'agent_reasoning'
  text: string
}

export interface TokenCountPayload {
  type: 'token_count'
  info: {
    total_token_usage: {
      input_tokens: number
      cached_input_tokens?: number
      output_tokens: number
      reasoning_output_tokens?: number
      total_tokens: number
    }
    model_context_window?: number
  } | null
  rate_limits?: unknown
}

// response_item subtypes
export type ResponseItemPayload =
  | MessageItemPayload
  | ReasoningItemPayload
  | FunctionCallPayload
  | FunctionCallOutputPayload
  | CustomToolCallPayload
  | CustomToolCallOutputPayload

export interface MessageItemPayload {
  type: 'message'
  role: 'developer' | 'user' | 'assistant'
  content: Array<{ type: string; text?: string }>
  status?: string
  phase?: string
}

export interface ReasoningItemPayload {
  type: 'reasoning'
  summary?: Array<{ type: string; text: string }>
  content: unknown
  encrypted_content?: string
}

export interface FunctionCallPayload {
  type: 'function_call'
  name: string
  arguments: string
  call_id: string
}

export interface FunctionCallOutputPayload {
  type: 'function_call_output'
  call_id: string
  output: string
}

export interface CustomToolCallPayload {
  type: 'custom_tool_call'
  name: string
  call_id: string
  input: unknown
  status?: string
}

export interface CustomToolCallOutputPayload {
  type: 'custom_tool_call_output'
  call_id: string
  output: string
}
