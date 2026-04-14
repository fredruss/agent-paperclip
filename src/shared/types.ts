/**
 * Shared type definitions for Claude Companion standalone scripts
 */

// Pet state types
export type PetState = 'idle' | 'thinking' | 'working' | 'reading' | 'waiting' | 'done' | 'error'

export interface TokenUsage {
  context: number // Current context size (input + cache_creation + cache_read)
  output: number
}

export interface Status {
  status: PetState
  action: string
  timestamp: number
  usage?: TokenUsage
}

// Claude Code hook event types
export type HookEventName =
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Notification'

export type NotificationType = 'permission_prompt' | 'elicitation_dialog' | 'idle_prompt'

export interface ToolInput {
  file_path?: string
  command?: string
  pattern?: string
  [key: string]: unknown
}

export interface ToolResponse {
  success?: boolean
  [key: string]: unknown
}

export interface HookEvent {
  hook_event_name: HookEventName
  tool_name?: string
  tool_input?: ToolInput
  tool_response?: ToolResponse
  user_prompt?: string
  transcript_path?: string
  notification_type?: NotificationType
}

// Claude Code settings types
export interface HookCommand {
  type: 'command'
  command: string
}

export interface HookEntry {
  matcher?: string
  hooks: HookCommand[]
}

export interface HooksConfig {
  UserPromptSubmit?: HookEntry[]
  PreToolUse?: HookEntry[]
  PostToolUse?: HookEntry[]
  Stop?: HookEntry[]
  Notification?: HookEntry[]
  [key: string]: HookEntry[] | undefined
}

export interface StatusLineConfig {
  type: 'command'
  command: string
  padding?: number
}

export interface ClaudeSettings {
  hooks?: HooksConfig
  statusLine?: StatusLineConfig
  [key: string]: unknown
}

// Multi-session types
export type SessionSource = 'claude-code' | 'codex'

export interface SessionStatus extends Status {
  sessionId: string
  source: SessionSource
  lastActivity: number
}

export type SessionMap = Record<string, SessionStatus>

export interface SessionsFile {
  sessions: SessionMap
}
