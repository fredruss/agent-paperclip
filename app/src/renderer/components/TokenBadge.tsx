import { type ReactNode } from 'react'
import { useAutoHide } from '../hooks/useAutoHide'
import type { SessionInfo, PetState } from '../../shared/types'
import './TokenBadge.css'

interface TokenBadgeProps {
  sessions: SessionInfo[]
  status: PetState
}

const HIDE_DELAY = 10000 // Hide badge after 10 seconds of idle

/**
 * Format token count in compact form: 1234 → "1.2k", 1234567 → "1.2M"
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`
  }
  return count.toString()
}

function getContextTokens(usage: SessionInfo['usage']): number {
  if (!usage) return 0
  // Support legacy format (input/cacheRead) for backwards compatibility
  type LegacyUsage = { input?: number; cacheRead?: number }
  const legacy = usage as unknown as LegacyUsage
  return usage.context ?? ((legacy.input || 0) + (legacy.cacheRead || 0))
}

export function TokenBadge({ sessions, status }: TokenBadgeProps): ReactNode {
  const sessionsWithUsage = sessions.filter((s) => s.usage)
  const visible = useAutoHide(status === 'idle', HIDE_DELAY, [sessions, status])

  if (sessionsWithUsage.length === 0 || !visible) {
    return null
  }

  if (sessionsWithUsage.length === 1) {
    return (
      <div className="token-badge">
        {formatTokens(getContextTokens(sessionsWithUsage[0].usage))}
      </div>
    )
  }

  // Multiple sessions: show up to 3, then +N for overflow
  const shown = sessionsWithUsage.slice(0, 3)
  const overflow = sessionsWithUsage.length - 3

  return (
    <div className="token-badge">
      {shown.map((s, i) => (
        <span key={s.sessionId}>
          {i > 0 && ' \u00b7 '}
          {formatTokens(getContextTokens(s.usage))}
        </span>
      ))}
      {overflow > 0 && ` +${overflow}`}
    </div>
  )
}
