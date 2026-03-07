import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TokenBadge, formatTokens } from './TokenBadge'
import type { SessionInfo } from '../../shared/types'

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: 's1',
    source: 'claude-code',
    status: 'working',
    action: 'Working...',
    ...overrides
  }
}

describe('formatTokens', () => {
  it('returns raw number for values under 1000', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(1)).toBe('1')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats thousands with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(9999)).toBe('10.0k')
    expect(formatTokens(999999)).toBe('1000.0k')
  })

  it('formats millions with M suffix', () => {
    expect(formatTokens(1000000)).toBe('1.0M')
    expect(formatTokens(1234567)).toBe('1.2M')
    expect(formatTokens(10500000)).toBe('10.5M')
  })
})

describe('TokenBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when sessions have no usage', () => {
    const { container } = render(<TokenBadge sessions={[makeSession()]} status="working" />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when sessions is empty', () => {
    const { container } = render(<TokenBadge sessions={[]} status="working" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders token count for single session with usage', () => {
    const sessions = [makeSession({ usage: { context: 1500, output: 500 } })]
    render(<TokenBadge sessions={sessions} status="working" />)
    expect(screen.getByText('1.5k')).toBeTruthy()
  })

  it('renders formatted token count for large values', () => {
    const sessions = [makeSession({ usage: { context: 1500000, output: 500 } })]
    render(<TokenBadge sessions={sessions} status="working" />)
    expect(screen.getByText('1.5M')).toBeTruthy()
  })

  it('renders multiple sessions separated by middle dot', () => {
    const sessions = [
      makeSession({ sessionId: 's1', usage: { context: 1000, output: 100 } }),
      makeSession({ sessionId: 's2', usage: { context: 2000, output: 200 } })
    ]
    const { container } = render(<TokenBadge sessions={sessions} status="working" />)
    const badge = container.querySelector('.token-badge')
    expect(badge?.textContent).toContain('1.0k')
    expect(badge?.textContent).toContain('\u00b7')
    expect(badge?.textContent).toContain('2.0k')
  })

  it('shows overflow count for more than 3 sessions', () => {
    const sessions = [
      makeSession({ sessionId: 's1', usage: { context: 1000, output: 100 } }),
      makeSession({ sessionId: 's2', usage: { context: 2000, output: 200 } }),
      makeSession({ sessionId: 's3', usage: { context: 3000, output: 300 } }),
      makeSession({ sessionId: 's4', usage: { context: 4000, output: 400 } })
    ]
    const { container } = render(<TokenBadge sessions={sessions} status="working" />)
    expect(container.textContent).toContain('+1')
  })

  it('hides badge after delay when status is idle', async () => {
    const sessions = [makeSession({ usage: { context: 1500, output: 500 } })]
    const { container, rerender } = render(<TokenBadge sessions={sessions} status="working" />)

    expect(screen.getByText('1.5k')).toBeTruthy()

    rerender(<TokenBadge sessions={sessions} status="idle" />)

    expect(screen.getByText('1.5k')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(container.querySelector('.token-badge')).toBeNull()
  })

  it('stays visible when status changes back to non-idle', async () => {
    const sessions = [makeSession({ usage: { context: 1500, output: 500 } })]
    const { rerender } = render(<TokenBadge sessions={sessions} status="working" />)

    expect(screen.getByText('1.5k')).toBeTruthy()

    rerender(<TokenBadge sessions={sessions} status="idle" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    rerender(<TokenBadge sessions={sessions} status="working" />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(screen.getByText('1.5k')).toBeTruthy()
  })
})
