// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseJsonlChunk } from './session-watcher'
import type { CodexRolloutEntry } from './types'

function event(type: string, payload: Record<string, unknown>): CodexRolloutEntry {
  return {
    timestamp: '2026-02-15T00:00:00.000Z',
    type: type as CodexRolloutEntry['type'],
    payload: payload as CodexRolloutEntry['payload']
  }
}

describe('parseJsonlChunk', () => {
  it('parses complete newline-delimited JSON entries', () => {
    const a = JSON.stringify(event('event_msg', { type: 'user_message', message: 'hi' }))
    const b = JSON.stringify(event('event_msg', { type: 'task_complete', turn_id: 't1' }))
    const result = parseJsonlChunk(`${a}\n${b}\n`)

    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].type).toBe('event_msg')
    expect(result.entries[1].type).toBe('event_msg')
    expect(result.remainder).toBe('')
  })

  it('keeps incomplete trailing JSON as remainder', () => {
    const partial = '{"timestamp":"2026-02-15T00:00:00.000Z","type":"event_msg","payload":{"type":"task_complete"'
    const result = parseJsonlChunk(partial)

    expect(result.entries).toHaveLength(0)
    expect(result.remainder).toBe(partial)
  })

  it('reconstructs split JSON across reads', () => {
    const full = JSON.stringify(event('event_msg', { type: 'task_complete', turn_id: 't2' }))
    const splitAt = Math.floor(full.length / 2)

    const first = parseJsonlChunk(full.slice(0, splitAt))
    const second = parseJsonlChunk(`${full.slice(splitAt)}\n`, first.remainder)

    expect(first.entries).toHaveLength(0)
    expect(second.entries).toHaveLength(1)
    expect((second.entries[0].payload as { type?: string }).type).toBe('task_complete')
    expect(second.remainder).toBe('')
  })

  it('parses a valid final line even without trailing newline', () => {
    const single = JSON.stringify(event('event_msg', { type: 'task_complete', turn_id: 't3' }))
    const result = parseJsonlChunk(single)

    expect(result.entries).toHaveLength(1)
    expect((result.entries[0].payload as { type?: string }).type).toBe('task_complete')
    expect(result.remainder).toBe('')
  })

  it('skips malformed complete lines while preserving good ones', () => {
    const good = JSON.stringify(event('event_msg', { type: 'user_message', message: 'ok' }))
    const result = parseJsonlChunk(`${good}\nnot-json\n`)

    expect(result.entries).toHaveLength(1)
    expect((result.entries[0].payload as { type?: string }).type).toBe('user_message')
    expect(result.remainder).toBe('')
  })
})
