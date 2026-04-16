// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CodexRolloutEntry } from './types'

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true)
}))

vi.mock('../lib/status-writer', () => ({
  writeStatus: vi.fn().mockResolvedValue(undefined),
  writeSessionStatus: vi.fn().mockResolvedValue(undefined),
  writeUsage: vi.fn().mockResolvedValue(undefined),
  removeSession: vi.fn().mockResolvedValue(undefined),
  sessionIdFromPath: vi.fn((path: string) => `sid-${path.split('/').pop()}`)
}))

vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
    add: vi.fn(),
    unwatch: vi.fn()
  }))
}))

vi.mock('./session-finder', () => ({
  findLatestSession: vi.fn().mockResolvedValue(null),
  CODEX_HOME: '/tmp/test-codex',
  SESSIONS_DIR: '/tmp/test-codex/sessions'
}))

vi.mock('./session-watcher', () => ({
  watchSession: vi.fn().mockResolvedValue({ close: vi.fn() }),
  watchForFirstSession: vi.fn().mockResolvedValue({ close: vi.fn() })
}))

import { createEventHandler } from './watcher'
import { writeStatus, writeSessionStatus, writeUsage, removeSession } from '../lib/status-writer'

const mockedWriteStatus = vi.mocked(writeStatus)
const mockedWriteSessionStatus = vi.mocked(writeSessionStatus)
const mockedWriteUsage = vi.mocked(writeUsage)
const mockedRemoveSession = vi.mocked(removeSession)

function entry(type: string, payload: Record<string, unknown>): CodexRolloutEntry {
  return {
    timestamp: '2026-02-15T13:00:00.000Z',
    type: type as CodexRolloutEntry['type'],
    payload: payload as CodexRolloutEntry['payload']
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createEventHandler', () => {
  it('writes to both sessions.json and status.json', () => {
    const handle = createEventHandler()
    handle(entry('event_msg', { type: 'task_started', turn_id: 't1' }), '/sessions/rollout-a.jsonl')

    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'thinking', 'Thinking...', undefined
    )
    expect(mockedWriteStatus).toHaveBeenCalledWith('thinking', 'Thinking...', null)
  })

  it('derives sessionId from sessionFile path', () => {
    const handle = createEventHandler()
    handle(entry('session_meta', { id: 'abc', timestamp: '', cwd: '/', cli_version: '1.0' }), '/sessions/rollout-a.jsonl')
    handle(entry('session_meta', { id: 'def', timestamp: '', cwd: '/', cli_version: '1.0' }), '/sessions/rollout-b.jsonl')

    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'idle', 'Codex session started!', undefined
    )
    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-b.jsonl', 'codex', 'idle', 'Codex session started!', undefined
    )
  })

  it('tracks usage per session independently', () => {
    const handle = createEventHandler()
    const fileA = '/sessions/rollout-a.jsonl'
    const fileB = '/sessions/rollout-b.jsonl'

    // Session A gets usage
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    }), fileA)

    // Session B gets different usage
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 200, output_tokens: 80, total_tokens: 280 } }
    }), fileB)

    // Session A sends a status event — should use session A's usage
    handle(entry('event_msg', { type: 'task_started', turn_id: 't1' }), fileA)
    expect(mockedWriteSessionStatus).toHaveBeenLastCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'thinking', 'Thinking...', { context: 100, output: 50 }
    )

    // Session B sends a status event — should use session B's usage
    handle(entry('event_msg', { type: 'task_started', turn_id: 't2' }), fileB)
    expect(mockedWriteSessionStatus).toHaveBeenLastCalledWith(
      'sid-rollout-b.jsonl', 'codex', 'thinking', 'Thinking...', { context: 200, output: 80 }
    )
  })

  it('clears usage on session_meta for that session only', () => {
    const handle = createEventHandler()
    const fileA = '/sessions/rollout-a.jsonl'
    const fileB = '/sessions/rollout-b.jsonl'

    // Both sessions get usage
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    }), fileA)
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 200, output_tokens: 80, total_tokens: 280 } }
    }), fileB)

    // Session A restarts — clear A's usage only
    handle(entry('session_meta', { id: 'new', timestamp: '', cwd: '/', cli_version: '1.0' }), fileA)

    // Session A event should have no usage
    vi.clearAllMocks()
    handle(entry('event_msg', { type: 'task_started', turn_id: 't1' }), fileA)
    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'thinking', 'Thinking...', undefined
    )

    // Session B event should still have its usage
    handle(entry('event_msg', { type: 'task_started', turn_id: 't2' }), fileB)
    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-b.jsonl', 'codex', 'thinking', 'Thinking...', { context: 200, output: 80 }
    )
  })

  it('calls removeSession on task_complete', () => {
    const handle = createEventHandler()
    handle(entry('event_msg', { type: 'task_complete', turn_id: 't1' }), '/sessions/rollout-a.jsonl')

    expect(mockedRemoveSession).toHaveBeenCalledWith('sid-rollout-a.jsonl')
    // Should also write the done status before removing
    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'done', 'All done!', undefined
    )
  })

  it('does not call removeSession for non-complete events', () => {
    const handle = createEventHandler()
    handle(entry('event_msg', { type: 'task_started', turn_id: 't1' }), '/sessions/rollout-a.jsonl')

    expect(mockedRemoveSession).not.toHaveBeenCalled()
  })

  it('writes usage.json when token_count carries rate_limits', () => {
    const handle = createEventHandler()
    handle(entry('event_msg', {
      type: 'token_count',
      info: null,
      rate_limits: {
        primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1_800_000_000 },
        secondary: { used_percent: 40, window_minutes: 10_080, resets_at: 1_800_500_000 }
      }
    }), '/sessions/rollout-a.jsonl')

    expect(mockedWriteUsage).toHaveBeenCalledTimes(1)
    expect(mockedWriteUsage).toHaveBeenCalledWith(expect.objectContaining({
      source: 'codex',
      usedPercentage: 12.5,
      resetsAt: 1_800_000_000
    }))
  })

  it('does not write usage.json when token_count has no rate_limits', () => {
    const handle = createEventHandler()
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    }), '/sessions/rollout-a.jsonl')

    expect(mockedWriteUsage).not.toHaveBeenCalled()
  })

  it('cleans up usage map on task_complete', () => {
    const handle = createEventHandler()
    const file = '/sessions/rollout-a.jsonl'

    // Set usage then complete
    handle(entry('event_msg', {
      type: 'token_count',
      info: { total_token_usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } }
    }), file)
    handle(entry('event_msg', { type: 'task_complete', turn_id: 't1' }), file)

    // New event on same session should have no usage (it was cleaned up)
    vi.clearAllMocks()
    handle(entry('event_msg', { type: 'task_started', turn_id: 't2' }), file)
    expect(mockedWriteSessionStatus).toHaveBeenCalledWith(
      'sid-rollout-a.jsonl', 'codex', 'thinking', 'Thinking...', undefined
    )
  })
})
