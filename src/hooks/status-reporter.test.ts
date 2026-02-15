// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { HookEvent } from '../shared/types'

// Mock fs for parseTranscript's existsSync/readFile
const mockExistsSync = vi.fn()
const mockReadFile = vi.fn()
const mockWriteStatus = vi.fn()

vi.mock('fs', () => ({
  default: { existsSync: mockExistsSync },
  existsSync: mockExistsSync
}))

vi.mock('fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile
}))

vi.mock('../lib/status-writer', () => ({
  writeStatus: mockWriteStatus
}))

// Now import the module under test
const { handleEvent, parseTranscript } = await import('./status-reporter')

describe('handleEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockWriteStatus.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns thinking state for UserPromptSubmit event', async () => {
    const event: HookEvent = {
      hook_event_name: 'UserPromptSubmit',
      user_prompt: 'Hello world'
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('thinking', 'Thinking...', null)
  })

  it('returns reading state for Read tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/path/to/file.ts' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('reading', 'Reading file.ts...', null)
  })

  it('returns reading state for Glob tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Glob'
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('reading', 'Searching files...', null)
  })

  it('returns reading state for Grep tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: 'searchPattern' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith(
      'reading',
      'Searching for "searchPattern"...',
      null
    )
  })

  it('returns working state for Edit tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/path/to/file.ts' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Editing file.ts...', null)
  })

  it('returns working state for Write tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/path/to/file.ts' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Writing file.ts...', null)
  })

  it('returns working state for Bash tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Running npm...', null)
  })

  it('returns done state for Stop event', async () => {
    const event: HookEvent = {
      hook_event_name: 'Stop'
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('done', 'All done!', null)
  })

  it('extracts filename from file_path in tool_input for Read', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/path/to/myfile.ts' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('reading', 'Reading myfile.ts...', null)
  })

  it('extracts filename from file_path for Write', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: '/some/path/newfile.js' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Writing newfile.js...', null)
  })

  it('extracts filename from file_path for Edit', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/deep/nested/path/component.tsx' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Editing component.tsx...', null)
  })

  it('truncates long patterns in Grep tool', async () => {
    const longPattern = 'a'.repeat(30)
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: longPattern }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith(
      'reading',
      `Searching for "${longPattern.slice(0, 20)}..."...`,
      null
    )
  })

  it('extracts command name from Bash tool', async () => {
    const event: HookEvent = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm run build --production' }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('working', 'Running npm...', null)
  })

  it('returns waiting state for permission_prompt Notification', async () => {
    const event: HookEvent = {
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt'
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('waiting', 'Needs your permission...', null)
  })

  it('returns waiting state for elicitation_dialog Notification', async () => {
    const event: HookEvent = {
      hook_event_name: 'Notification',
      notification_type: 'elicitation_dialog'
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('waiting', 'Has a question for you...', null)
  })

  it('returns error state for failed PostToolUse', async () => {
    const event: HookEvent = {
      hook_event_name: 'PostToolUse',
      tool_response: { success: false }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('error', 'Something went wrong...', null)
  })

  it('returns thinking state for successful PostToolUse', async () => {
    const event: HookEvent = {
      hook_event_name: 'PostToolUse',
      tool_response: { success: true }
    }

    await handleEvent(event)

    expect(mockWriteStatus).toHaveBeenCalledWith('thinking', 'Thinking...', null)
  })
})

describe('parseTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns null usage and thinking for missing file', async () => {
    mockExistsSync.mockReturnValue(false)

    const result = await parseTranscript('/nonexistent/path.jsonl')

    expect(result).toEqual({ usage: null, thinking: null })
  })

  it('returns null usage and thinking for undefined path', async () => {
    const result = await parseTranscript(undefined)

    expect(result).toEqual({ usage: null, thinking: null })
  })

  it('returns latest request context size, not cumulative', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({
        message: {
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 5, cache_read_input_tokens: 20 }
        }
      }),
      JSON.stringify({
        message: {
          usage: { input_tokens: 200, output_tokens: 100, cache_creation_input_tokens: 10, cache_read_input_tokens: 30 }
        }
      }),
      JSON.stringify({
        message: {
          usage: { input_tokens: 150, output_tokens: 75, cache_creation_input_tokens: 15, cache_read_input_tokens: 10 }
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Returns LATEST request's context, not cumulative sum
    // Last entry: 150 + 15 + 10 = 175 context, 75 output
    expect(result.usage).toEqual({
      context: 175,
      output: 75
    })
  })

  it('handles malformed JSON lines gracefully', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20 } } }),
      'invalid json line',
      JSON.stringify({ message: { usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 30 } } })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Returns latest valid entry: 200 + 30 = 230 context, 100 output
    expect(result.usage).toEqual({
      context: 230,
      output: 100
    })
  })

  it('returns null usage when no token data present', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({ message: { content: 'hello' } }),
      JSON.stringify({ message: { content: 'world' } })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    expect(result.usage).toBeNull()
  })

  it('handles empty lines in JSONL', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({ message: { usage: { input_tokens: 100, output_tokens: 50 } } }),
      '',
      '  ',
      JSON.stringify({ message: { usage: { input_tokens: 200, output_tokens: 100 } } })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Returns latest entry: 200 context, 100 output
    expect(result.usage).toEqual({
      context: 200,
      output: 100
    })
  })

  it('handles missing optional fields', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = JSON.stringify({
      message: { usage: { input_tokens: 100, output_tokens: 50 } }
    })

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    expect(result.usage).toEqual({
      context: 100,
      output: 50
    })
  })

  it('returns the latest unique request context (ignores duplicate requestIds)', async () => {
    mockExistsSync.mockReturnValue(true)
    // Simulate streaming: same requestId appears multiple times, then a new request
    const jsonlContent = [
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000 } } }),
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000 } } }),
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000 } } }),
      JSON.stringify({ requestId: 'req-2', message: { usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 2000 } } })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Returns LATEST request (req-2): 200 + 2000 = 2200 context, 100 output
    expect(result.usage).toEqual({
      context: 2200,
      output: 100
    })
  })

  it('captures final values when same requestId has growing usage (streaming)', async () => {
    mockExistsSync.mockReturnValue(true)
    // Simulate streaming: same requestId with GROWING usage over time
    // This tests that we capture the LAST entry's values, not the first
    const jsonlContent = [
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 10, output_tokens: 5 } } }),
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 50, output_tokens: 25 } } }),
      JSON.stringify({ requestId: 'req-1', message: { usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000 } } })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Should return LAST entry's values (100 + 1000 = 1100), not first (10)
    expect(result.usage).toEqual({
      context: 1100,
      output: 50
    })
  })

  it('extracts thinking content from transcript', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({
        message: {
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [
            { type: 'thinking', thinking: 'Let me analyze this code carefully...' }
          ]
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // 37 chars, under limit, no truncation
    expect(result.thinking).toBe('Let me analyze this code carefully...')
  })

  it('returns latest thinking content when multiple exist', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({
        message: {
          content: [{ type: 'thinking', thinking: 'First thought' }]
        }
      }),
      JSON.stringify({
        message: {
          content: [{ type: 'thinking', thinking: 'This is a longer second thought that exceeds the limit' }]
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Truncates at word boundary: "This is a longer second thought that" (37 chars) + "..."
    expect(result.thinking).toBe('This is a longer second thought that...')
  })

  it('ignores text blocks and only extracts thinking blocks', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({
        message: {
          content: [
            { type: 'text', text: 'This is user-facing response' },
            { type: 'thinking', thinking: 'This is internal reasoning' }
          ]
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    expect(result.thinking).toBe('This is internal reasoning')
  })

  it('truncates long thinking content', async () => {
    mockExistsSync.mockReturnValue(true)
    const longThinking = 'A'.repeat(100)
    const jsonlContent = [
      JSON.stringify({
        message: {
          content: [{ type: 'thinking', thinking: longThinking }]
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    expect(result.thinking).toHaveLength(43) // 40 chars + '...'
    expect(result.thinking).toMatch(/\.\.\.$/);
  })

  it('returns null thinking when thinking is from a different request than usage', async () => {
    mockExistsSync.mockReturnValue(true)
    // Thinking from req-1, but latest usage is from req-2 (which has no thinking)
    const jsonlContent = [
      JSON.stringify({
        requestId: 'req-1',
        message: {
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{ type: 'thinking', thinking: 'Old thinking from previous request' }]
        }
      }),
      JSON.stringify({
        requestId: 'req-2',
        message: {
          usage: { input_tokens: 200, output_tokens: 100 }
          // No thinking in this request
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    // Usage should be from req-2
    expect(result.usage).toEqual({ context: 200, output: 100 })
    // Thinking should be null because it's from req-1, not req-2
    expect(result.thinking).toBeNull()
  })

  it('returns thinking when it matches the latest usage request', async () => {
    mockExistsSync.mockReturnValue(true)
    const jsonlContent = [
      JSON.stringify({
        requestId: 'req-1',
        message: {
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [{ type: 'thinking', thinking: 'Old thinking' }]
        }
      }),
      JSON.stringify({
        requestId: 'req-2',
        message: {
          usage: { input_tokens: 200, output_tokens: 100 },
          content: [{ type: 'thinking', thinking: 'Current thinking' }]
        }
      })
    ].join('\n')

    mockReadFile.mockResolvedValue(jsonlContent)

    const result = await parseTranscript('/path/to/transcript.jsonl')

    expect(result.usage).toEqual({ context: 200, output: 100 })
    expect(result.thinking).toBe('Current thinking')
  })
})
