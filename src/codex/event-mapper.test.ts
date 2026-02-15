// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mapCodexEvent, extractUsageFromEntry } from './event-mapper'
import type { CodexRolloutEntry } from './types'

function entry(type: string, payload: Record<string, unknown>): CodexRolloutEntry {
  return {
    timestamp: '2026-02-15T13:00:00.000Z',
    type: type as CodexRolloutEntry['type'],
    payload: payload as CodexRolloutEntry['payload']
  }
}

describe('mapCodexEvent', () => {
  it('maps session_meta to idle', () => {
    const result = mapCodexEvent(entry('session_meta', { id: 'abc', timestamp: '', cwd: '/', cli_version: '1.0' }))
    expect(result).toEqual({ status: 'idle', action: 'Codex session started!' })
  })

  it('returns null for turn_context', () => {
    const result = mapCodexEvent(entry('turn_context', { cwd: '/', model: 'gpt-5' }))
    expect(result).toBeNull()
  })

  it('maps user_message to thinking', () => {
    const result = mapCodexEvent(entry('event_msg', { type: 'user_message', message: 'hello' }))
    expect(result).toEqual({ status: 'thinking', action: 'Thinking...' })
  })

  it('maps task_started to thinking', () => {
    const result = mapCodexEvent(entry('event_msg', { type: 'task_started', turn_id: 'turn_1' }))
    expect(result).toEqual({ status: 'thinking', action: 'Thinking...' })
  })

  it('maps task_complete to done', () => {
    const result = mapCodexEvent(entry('event_msg', { type: 'task_complete', turn_id: 'turn_1' }))
    expect(result).toEqual({ status: 'done', action: 'All done!' })
  })

  it('maps agent_reasoning to thinking with text', () => {
    const result = mapCodexEvent(entry('event_msg', { type: 'agent_reasoning', text: 'Analyzing code' }))
    expect(result).toEqual({ status: 'thinking', action: 'Thinking: "Analyzing code"' })
  })

  it('truncates long agent_reasoning text', () => {
    const longText = 'A'.repeat(60)
    const result = mapCodexEvent(entry('event_msg', { type: 'agent_reasoning', text: longText }))
    expect(result!.action).toContain('...')
    expect(result!.action.length).toBeLessThan(60)
  })

  it('maps agent_message to thinking/responding', () => {
    const result = mapCodexEvent(entry('event_msg', { type: 'agent_message', message: 'Done' }))
    expect(result).toEqual({ status: 'thinking', action: 'Responding...' })
  })

  it('returns null for token_count', () => {
    const result = mapCodexEvent(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    }))
    expect(result).toBeNull()
  })

  it('maps exec_command function_call to working', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'exec_command',
      arguments: '{"cmd":"ls -la"}',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'working', action: 'Running ls...' })
  })

  it('maps shell_command function_call to working', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'shell_command',
      arguments: '{"cmd":"npm test"}',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'working', action: 'Running npm...' })
  })

  it('handles malformed function_call arguments gracefully', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'exec_command',
      arguments: 'not json',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'working', action: 'Running command...' })
  })

  it('maps apply_patch function_call to working', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'apply_patch',
      arguments: '{}',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'working', action: 'Editing file...' })
  })

  it('maps read_mcp_resource to reading', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'read_mcp_resource',
      arguments: '{}',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'reading', action: 'Reading resource...' })
  })

  it('maps custom_tool_call apply_patch to working', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'custom_tool_call',
      name: 'apply_patch',
      call_id: 'call_1',
      input: {}
    }))
    expect(result).toEqual({ status: 'working', action: 'Editing file...' })
  })

  it('maps function_call_output to thinking', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'some output'
    }))
    expect(result).toEqual({ status: 'thinking', action: 'Thinking...' })
  })

  it('maps custom_tool_call_output to thinking', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'custom_tool_call_output',
      call_id: 'call_1',
      output: 'some output'
    }))
    expect(result).toEqual({ status: 'thinking', action: 'Thinking...' })
  })

  it('maps assistant message to responding', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'hello' }]
    }))
    expect(result).toEqual({ status: 'thinking', action: 'Responding...' })
  })

  it('maps assistant final_answer message to done', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'message',
      role: 'assistant',
      phase: 'final_answer',
      content: [{ type: 'output_text', text: 'hello' }]
    }))
    expect(result).toEqual({ status: 'done', action: 'All done!' })
  })

  it('returns null for developer/user messages', () => {
    expect(mapCodexEvent(entry('response_item', {
      type: 'message', role: 'developer', content: []
    }))).toBeNull()
    expect(mapCodexEvent(entry('response_item', {
      type: 'message', role: 'user', content: []
    }))).toBeNull()
  })

  it('returns null for reasoning items', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'reasoning', summary: [], content: null
    }))
    expect(result).toBeNull()
  })

  it('maps unknown function_call to working with name', () => {
    const result = mapCodexEvent(entry('response_item', {
      type: 'function_call',
      name: 'custom_tool',
      arguments: '{}',
      call_id: 'call_1'
    }))
    expect(result).toEqual({ status: 'working', action: 'Using custom_tool...' })
  })
})

describe('extractUsageFromEntry', () => {
  it('extracts usage from token_count event', () => {
    const result = extractUsageFromEntry(entry('event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 8000,
          cached_input_tokens: 7000,
          output_tokens: 300,
          total_tokens: 8300
        }
      }
    }))
    expect(result).toEqual({ context: 15000, output: 300 })
  })

  it('returns undefined for non-token_count events', () => {
    expect(extractUsageFromEntry(entry('event_msg', { type: 'user_message', message: 'hi' }))).toBeUndefined()
    expect(extractUsageFromEntry(entry('session_meta', { id: 'a', timestamp: '', cwd: '/', cli_version: '1' }))).toBeUndefined()
  })

  it('returns undefined when info is null', () => {
    const result = extractUsageFromEntry(entry('event_msg', {
      type: 'token_count',
      info: null
    }))
    expect(result).toBeUndefined()
  })
})
