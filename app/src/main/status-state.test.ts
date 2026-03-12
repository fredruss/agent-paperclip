// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildMultiSessionStatus, legacyToMultiSession, normalizeLegacyStatus } from './status-state'

describe('buildMultiSessionStatus', () => {
  it('keeps an active multi-session primary status instead of normalizing it to idle', () => {
    const now = 1_000_000
    const result = buildMultiSessionStatus({
      sessions: {
        codex: {
          sessionId: 'codex',
          source: 'codex',
          status: 'working',
          action: 'Editing file...',
          timestamp: now - 15_000,
          lastActivity: now - 15_000
        },
        claude: {
          sessionId: 'claude',
          source: 'claude-code',
          status: 'done',
          action: 'All done!',
          timestamp: now - 1_000,
          lastActivity: now - 1_000
        }
      }
    }, now)

    expect(result.sessionCount).toBe(1)
    expect(result.primary.status).toBe('working')
    expect(result.primary.action).toBe('Editing file...')
  })

  it('falls back to idle when all sessions are stale', () => {
    const now = 1_000_000
    const result = buildMultiSessionStatus({
      sessions: {
        codex: {
          sessionId: 'codex',
          source: 'codex',
          status: 'working',
          action: 'Editing file...',
          timestamp: now - 40_000,
          lastActivity: now - 40_000
        }
      }
    }, now)

    expect(result).toEqual({
      primary: { status: 'idle', action: 'Waiting for Agent...', timestamp: now },
      sessions: [],
      sessionCount: 0
    })
  })
})

describe('normalizeLegacyStatus', () => {
  it('normalizes stale single-session working status to idle', () => {
    const now = 1_000_000
    const result = normalizeLegacyStatus({
      status: 'working',
      action: 'Editing file...',
      timestamp: now - 15_000
    }, now)

    expect(result).toEqual({
      status: 'idle',
      action: 'Waiting for Agent...',
      timestamp: now - 15_000
    })
  })
})

describe('legacyToMultiSession', () => {
  it('wraps an active legacy status as a single session', () => {
    expect(legacyToMultiSession({
      status: 'thinking',
      action: 'Thinking...',
      timestamp: 123
    })).toEqual({
      primary: {
        status: 'thinking',
        action: 'Thinking...',
        timestamp: 123
      },
      sessions: [{
        sessionId: 'legacy',
        source: 'claude-code',
        status: 'thinking',
        action: 'Thinking...'
      }],
      sessionCount: 1
    })
  })
})
