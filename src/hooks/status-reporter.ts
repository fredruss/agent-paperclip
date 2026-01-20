#!/usr/bin/env node

/**
 * Claude Code Companion Status Reporter Hook
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

import { writeFile, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PetState, TokenUsage, Status, HookEvent } from '../shared/types'

const STATUS_DIR = join(homedir(), '.claude-companion')
const STATUS_FILE = join(STATUS_DIR, 'status.json')

// Tool name to human-readable action mapping
const TOOL_ACTIONS: Record<string, string> = {
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
}

// Map tool names to pet states
const TOOL_STATES: Record<string, PetState> = {
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
}

async function ensureStatusDir(): Promise<void> {
  if (!existsSync(STATUS_DIR)) {
    await mkdir(STATUS_DIR, { recursive: true })
  }
}

/**
 * Parse transcript JSONL file and get the latest request's context size.
 * This shows how "full" the context window is, not cumulative usage.
 */
export async function parseTranscriptUsage(transcriptPath: string | undefined): Promise<TokenUsage | null> {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null
  }

  try {
    const content = await readFile(transcriptPath, 'utf8')
    const lines = content.trim().split('\n')

    let latestContext = 0
    let latestOutput = 0
    let latestRequestId: string | null = null

    // Process lines to find the latest request's usage
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line) as {
          requestId?: string
          message?: {
            usage?: {
              input_tokens?: number
              output_tokens?: number
              cache_creation_input_tokens?: number
              cache_read_input_tokens?: number
            }
          }
        }

        // Usage is nested inside message.usage for assistant messages
        const usage = entry.message?.usage
        if (usage) {
          // Always update - streaming chunks have same requestId but growing usage
          // Last entry in file has final totals
          latestRequestId = entry.requestId || null
          // Context size = input + cache_creation + cache_read
          // This represents how "full" the context window is for this request
          latestContext =
            (usage.input_tokens || 0) +
            (usage.cache_creation_input_tokens || 0) +
            (usage.cache_read_input_tokens || 0)
          latestOutput = usage.output_tokens || 0
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Only return usage if we found any tokens
    if (latestContext === 0 && latestOutput === 0) {
      return null
    }

    return {
      context: latestContext,
      output: latestOutput
    }
  } catch {
    return null
  }
}

async function writeStatus(
  status: PetState,
  action: string,
  usage: TokenUsage | null = null
): Promise<void> {
  await ensureStatusDir()
  const data: Status = {
    status,
    action,
    timestamp: Date.now()
  }
  if (usage) {
    data.usage = usage
  }
  await writeFile(STATUS_FILE, JSON.stringify(data, null, 2))
}

export async function handleEvent(event: HookEvent): Promise<void> {
  const { hook_event_name, tool_name, tool_input, tool_response, user_prompt, transcript_path } =
    event

  // Parse token usage from transcript (do this for most events)
  const usage = await parseTranscriptUsage(transcript_path)

  switch (hook_event_name) {
    case 'UserPromptSubmit': {
      let action = 'Thinking...'
      // Optionally show truncated prompt
      if (user_prompt && user_prompt.length > 0) {
        const truncated = user_prompt.slice(0, 30)
        action = `Thinking about: "${truncated}${user_prompt.length > 30 ? '...' : ''}"`
      }
      await writeStatus('thinking', action, usage)
      break
    }

    case 'PreToolUse': {
      const state = (tool_name && TOOL_STATES[tool_name]) || 'working'
      let action = (tool_name && TOOL_ACTIONS[tool_name]) || `Using ${tool_name}...`

      // Add more context for specific tools
      if (tool_name === 'Read' && tool_input?.file_path) {
        const filename = tool_input.file_path.split('/').pop()
        action = `Reading ${filename}...`
      } else if (tool_name === 'Write' && tool_input?.file_path) {
        const filename = tool_input.file_path.split('/').pop()
        action = `Writing ${filename}...`
      } else if (tool_name === 'Edit' && tool_input?.file_path) {
        const filename = tool_input.file_path.split('/').pop()
        action = `Editing ${filename}...`
      } else if (tool_name === 'Bash' && tool_input?.command) {
        const cmd = tool_input.command.split(' ')[0]
        action = `Running ${cmd}...`
      } else if (tool_name === 'Grep' && tool_input?.pattern) {
        action = `Searching for "${tool_input.pattern.slice(0, 20)}${tool_input.pattern.length > 20 ? '...' : ''}"...`
      }

      await writeStatus(state, action, usage)
      break
    }

    case 'PostToolUse': {
      if (tool_response && tool_response.success === false) {
        await writeStatus('error', 'Something went wrong...', usage)
      } else {
        // Tool completed successfully - return to thinking state
        // This ensures we don't get stuck in "waiting" after permission granted
        await writeStatus('thinking', 'Thinking...', usage)
      }
      break
    }

    case 'Stop': {
      // Stop event just indicates Claude finished - show "done" state
      await writeStatus('done', 'All done!', usage)
      break
    }

    case 'SessionStart': {
      await writeStatus('idle', 'Session started!')
      break
    }

    case 'SessionEnd': {
      await writeStatus('idle', 'Session ended', usage)
      break
    }

    case 'Notification': {
      const { notification_type } = event
      switch (notification_type) {
        case 'permission_prompt':
          await writeStatus('waiting', 'Needs your permission...', usage)
          break
        case 'elicitation_dialog':
          await writeStatus('waiting', 'Has a question for you...', usage)
          break
        case 'idle_prompt':
          // User has been idle for 60+ seconds - just ignore
          break
        default:
          // Unknown notification type, ignore
          break
      }
      break
    }

    default:
      // Unknown event, ignore
      break
  }
}

// Read JSON from stdin
async function main(): Promise<void> {
  let input = ''

  process.stdin.setEncoding('utf8')

  for await (const chunk of process.stdin) {
    input += chunk
  }

  if (!input.trim()) {
    process.exit(0)
  }

  try {
    const event = JSON.parse(input) as HookEvent
    await handleEvent(event)
  } catch (err) {
    console.error('Failed to parse event:', (err as Error).message)
    process.exit(1)
  }
}

const isMain = typeof require !== 'undefined' && require.main === module

// Only run when invoked directly; avoid running on import in tests.
if (isMain) {
  main().catch((err: Error) => {
    console.error('Hook error:', err)
    process.exit(1)
  })
}
