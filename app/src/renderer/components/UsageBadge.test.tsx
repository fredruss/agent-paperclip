import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { UsageBadge, formatTimeUntilReset } from './UsageBadge'
import type { UsageInfo } from '../../shared/types'

const FIXED_NOW_SECONDS = 1_744_000_000

function makeUsage(overrides: Partial<UsageInfo> = {}): UsageInfo {
  return {
    usedPercentage: 42.5,
    resetsAt: FIXED_NOW_SECONDS + 3 * 3600,
    updatedAt: FIXED_NOW_SECONDS,
    ...overrides
  }
}

describe('formatTimeUntilReset', () => {
  it('returns em dash when reset is in the past', () => {
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS - 10, FIXED_NOW_SECONDS)).toBe('—')
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS, FIXED_NOW_SECONDS)).toBe('—')
  })

  it('returns <1h when reset is within the hour', () => {
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 60, FIXED_NOW_SECONDS)).toBe('<1h')
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 1800, FIXED_NOW_SECONDS)).toBe('<1h')
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 3599, FIXED_NOW_SECONDS)).toBe('<1h')
  })

  it('floors hours when reset is 1h or more out', () => {
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 3600, FIXED_NOW_SECONDS)).toBe('1h')
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 3 * 3600, FIXED_NOW_SECONDS)).toBe('3h')
    expect(formatTimeUntilReset(FIXED_NOW_SECONDS + 3 * 3600 + 59 * 60, FIXED_NOW_SECONDS)).toBe('3h')
  })
})

describe('UsageBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when status is not idle', () => {
    const { container } = render(<UsageBadge usage={makeUsage()} status="working" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when usage is null', () => {
    const { container } = render(<UsageBadge usage={null} status="idle" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when reset is in the past', () => {
    const usage = makeUsage({ resetsAt: FIXED_NOW_SECONDS - 1 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders rounded percent and hours when idle', () => {
    const usage = makeUsage({ usedPercentage: 42.5, resetsAt: FIXED_NOW_SECONDS + 3 * 3600 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    expect(container.textContent).toBe('Claude: 43% · 3h')
  })

  it('renders 0% when usage is zero', () => {
    const usage = makeUsage({ usedPercentage: 0 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    expect(container.textContent).toContain('0%')
  })

  it('renders <1h when reset is 30 minutes away', () => {
    const usage = makeUsage({ resetsAt: FIXED_NOW_SECONDS + 1800 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    expect(container.textContent).toContain('<1h')
  })

  it('rounds 99.9% to 100%', () => {
    const usage = makeUsage({ usedPercentage: 99.9 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    expect(container.textContent).toContain('100%')
  })

  it('adds warn class when usage >= 80%', () => {
    const usage = makeUsage({ usedPercentage: 85 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    const badge = container.querySelector('.usage-badge')
    expect(badge?.className).toContain('usage-badge--warn')
  })

  it('omits warn class under 80%', () => {
    const usage = makeUsage({ usedPercentage: 79.9 })
    const { container } = render(<UsageBadge usage={usage} status="idle" />)
    const badge = container.querySelector('.usage-badge')
    expect(badge?.className).not.toContain('usage-badge--warn')
  })

  it('refreshes the clock immediately when going from hidden to visible', () => {
    const usage = makeUsage({ resetsAt: FIXED_NOW_SECONDS + 3 * 3600 })
    const { container, rerender } = render(<UsageBadge usage={usage} status="working" />)
    expect(container.firstChild).toBeNull()

    // Advance wall clock by 2 hours while the badge is hidden; no interval
    // should tick because the effect is inactive.
    vi.setSystemTime(new Date((FIXED_NOW_SECONDS + 2 * 3600) * 1000))

    rerender(<UsageBadge usage={usage} status="idle" />)

    // Should reflect fresh `now`, not the stale value from mount: 1h remaining.
    expect(container.textContent).toContain('1h')
  })

  it('hides immediately when reset passes between re-renders', () => {
    const usage = makeUsage({ resetsAt: FIXED_NOW_SECONDS + 1800 })
    const { container, rerender } = render(<UsageBadge usage={usage} status="working" />)

    vi.setSystemTime(new Date((FIXED_NOW_SECONDS + 2 * 3600) * 1000))

    rerender(<UsageBadge usage={usage} status="idle" />)

    expect(container.firstChild).toBeNull()
  })
})
