import { type ReactNode } from 'react'
import { Pet, StatusBubble, TokenBadge, SessionCount, UsageBadge } from './components'
import { useStatus, useSound, useUsage } from './hooks'
import './App.css'

function App(): ReactNode {
  const { primary, sessions, sessionCount, isHydrated, lastUpdateSource } = useStatus()
  const usage = useUsage()
  useSound(primary.status, isHydrated, lastUpdateSource)

  return (
    <div className="app-container">
      <StatusBubble action={primary.action} status={primary.status} />
      <div className="pet-wrapper">
        <Pet state={primary.status} />
        <SessionCount count={sessionCount} />
      </div>
      <TokenBadge sessions={sessions} status={primary.status} />
      {isHydrated && <UsageBadge usage={usage} status={primary.status} />}
    </div>
  )
}

export default App
