import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TokenBadge, formatTokens } from './TokenBadge'
import type { TokenUsage } from '../../shared/types'

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

  it('returns null when usage is undefined', () => {
    const { container } = render(<TokenBadge usage={undefined} status="working" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders token count when usage is provided and status is not idle', () => {
    const usage: TokenUsage = { context: 1500, output: 500 }
    render(<TokenBadge usage={usage} status="working" />)
    expect(screen.getByText('1.5k')).toBeTruthy()
  })

  it('renders formatted token count for large values', () => {
    const usage: TokenUsage = { context: 1500000, output: 500 }
    render(<TokenBadge usage={usage} status="working" />)
    expect(screen.getByText('1.5M')).toBeTruthy()
  })

  it('handles legacy format with input and cacheRead', () => {
    // Legacy format uses input/cacheRead instead of context
    const legacyUsage = { input: 500, cacheRead: 500, output: 100 } as unknown as TokenUsage
    render(<TokenBadge usage={legacyUsage} status="working" />)
    expect(screen.getByText('1.0k')).toBeTruthy()
  })

  it('prefers context field over legacy format', () => {
    // If context is present, it should be used
    const usage: TokenUsage = { context: 2000, output: 100 }
    render(<TokenBadge usage={usage} status="working" />)
    expect(screen.getByText('2.0k')).toBeTruthy()
  })

  it('hides badge after delay when status is idle', async () => {
    const usage: TokenUsage = { context: 1500, output: 500 }
    const { container, rerender } = render(<TokenBadge usage={usage} status="working" />)

    expect(screen.getByText('1.5k')).toBeTruthy()

    // Rerender with idle status
    rerender(<TokenBadge usage={usage} status="idle" />)

    // Should still be visible initially
    expect(screen.getByText('1.5k')).toBeTruthy()

    // Advance time to trigger auto-hide (10 seconds)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // Should be hidden now
    expect(container.querySelector('.token-badge')).toBeNull()
  })

  it('stays visible when status changes back to non-idle', async () => {
    const usage: TokenUsage = { context: 1500, output: 500 }
    const { rerender } = render(<TokenBadge usage={usage} status="working" />)

    expect(screen.getByText('1.5k')).toBeTruthy()

    // Switch to idle
    rerender(<TokenBadge usage={usage} status="idle" />)

    // Advance time partially
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Switch back to working
    rerender(<TokenBadge usage={usage} status="working" />)

    // Advance time past the original hide delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    // Should still be visible
    expect(screen.getByText('1.5k')).toBeTruthy()
  })
})
