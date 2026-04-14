import { useEffect, useState, type ReactNode } from 'react'
import type { PetState, UsageInfo } from '../../shared/types'
import './UsageBadge.css'

interface UsageBadgeProps {
  usage: UsageInfo | null
  status: PetState
}

const WARN_THRESHOLD = 80
const TICK_INTERVAL_MS = 60_000

export function formatTimeUntilReset(resetsAt: number, nowSeconds: number): string {
  const secondsUntil = resetsAt - nowSeconds
  if (secondsUntil <= 0) return '—'
  if (secondsUntil < 3600) return '<1h'
  return `${Math.floor(secondsUntil / 3600)}h`
}

function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, TICK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return now
}

function VisibleUsageBadge({ usage }: { usage: UsageInfo }): ReactNode {
  const nowSeconds = useNowSeconds()

  if (usage.resetsAt <= nowSeconds) return null

  const pct = Math.round(usage.usedPercentage)
  const timeStr = formatTimeUntilReset(usage.resetsAt, nowSeconds)
  const className = usage.usedPercentage >= WARN_THRESHOLD
    ? 'usage-badge usage-badge--warn'
    : 'usage-badge'

  return (
    <div className={className}>
      {pct}% · {timeStr}
    </div>
  )
}

export function UsageBadge({ usage, status }: UsageBadgeProps): ReactNode {
  if (status !== 'idle' || usage === null) return null
  return <VisibleUsageBadge usage={usage} />
}
