import type { Status, MultiSessionStatus, SessionInfo, SessionSource, TokenUsage } from '../shared/types'

const STALE_SESSION_MS = 30_000
const STALE_INTERACTIVE_MS = 300_000 // 5 min for waiting/prompt states
const STALE_ACTIVITY_MS = 10_000
const INTERACTIVE_STATES = new Set(['waiting'])

export interface SessionsFileFormat {
  sessions: Record<string, {
    sessionId: string
    source: SessionSource
    status: string
    action: string
    timestamp: number
    lastActivity: number
    usage?: TokenUsage
  }>
}

function stripUsage(status: Status): Status {
  const statusWithoutUsage = { ...status }
  delete statusWithoutUsage.usage
  return statusWithoutUsage
}

export function normalizeLegacyStatus(status: Status, now: number = Date.now()): Status {
  const age = now - status.timestamp
  if (age < STALE_ACTIVITY_MS) return status
  const staleStatus = stripUsage(status)

  // Transient activity states should not remain forever across app restarts.
  if (status.status === 'thinking' && status.action === 'Responding...') {
    return { ...staleStatus, status: 'done', action: 'All done!' }
  }
  if (status.status === 'thinking' || status.status === 'working' || status.status === 'reading') {
    return { ...staleStatus, status: 'idle', action: 'Waiting for Agent...' }
  }

  return staleStatus
}

export function buildMultiSessionStatus(
  parsed: SessionsFileFormat,
  now: number = Date.now()
): MultiSessionStatus {
  const entries = Object.values(parsed.sessions)
    .filter((session) => {
      const timeout = INTERACTIVE_STATES.has(session.status) ? STALE_INTERACTIVE_MS : STALE_SESSION_MS
      return now - session.lastActivity < timeout
    })
    .sort((a, b) => b.lastActivity - a.lastActivity)

  if (entries.length === 0) {
    return {
      primary: { status: 'idle', action: 'Waiting for Agent...', timestamp: now },
      sessions: [],
      sessionCount: 0
    }
  }

  const primaryEntry = entries.find((entry) => entry.status !== 'done') ?? entries[0]
  const primary: Status = {
    status: primaryEntry.status as Status['status'],
    action: primaryEntry.action,
    timestamp: primaryEntry.lastActivity,
    usage: primaryEntry.usage
  }

  const sessions: SessionInfo[] = entries.map((entry) => ({
    sessionId: entry.sessionId,
    source: entry.source,
    status: entry.status as SessionInfo['status'],
    action: entry.action,
    usage: entry.usage
  }))

  const activeCount = entries.filter((entry) => entry.status !== 'done').length
  return { primary, sessions, sessionCount: activeCount }
}

export function legacyToMultiSession(legacy: Status): MultiSessionStatus {
  const isActive = legacy.status !== 'idle' && legacy.status !== 'done'
  const sessions: SessionInfo[] = isActive
    ? [{ sessionId: 'legacy', source: 'claude-code', status: legacy.status, action: legacy.action, usage: legacy.usage }]
    : []
  return { primary: legacy, sessions, sessionCount: isActive ? 1 : 0 }
}
