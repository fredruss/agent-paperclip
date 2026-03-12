import { type ReactNode } from 'react'
import { Pet, StatusBubble, TokenBadge, SessionCount } from './components'
import { useStatus, useSound } from './hooks'
import './App.css'

function App(): ReactNode {
  const { primary, sessions, sessionCount } = useStatus()
  useSound(primary.status)

  return (
    <div className="app-container">
      <StatusBubble action={primary.action} status={primary.status} />
      <div className="pet-wrapper">
        <Pet state={primary.status} />
        <SessionCount count={sessionCount} />
      </div>
      <TokenBadge sessions={sessions} status={primary.status} />
    </div>
  )
}

export default App
