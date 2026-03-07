import { type ReactNode } from 'react'
import './SessionCount.css'

interface SessionCountProps {
  count: number
}

export function SessionCount({ count }: SessionCountProps): ReactNode {
  if (count <= 1) return null

  return (
    <div className="session-count">{count}</div>
  )
}
