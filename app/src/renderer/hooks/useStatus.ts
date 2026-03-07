import { useState, useEffect, useRef } from 'react'
import type { MultiSessionStatus } from '../../shared/types'

export type { MultiSessionStatus }

const defaultStatus: MultiSessionStatus = {
  primary: {
    status: 'idle',
    action: 'Waiting for Agent...',
    timestamp: Date.now()
  },
  sessions: [],
  sessionCount: 0
}

const IDLE_TIMEOUT_MS = 4000

export function useStatus(): MultiSessionStatus {
  const [status, setStatus] = useState<MultiSessionStatus>(defaultStatus)
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Get initial status
    window.electronAPI?.getStatus().then(setStatus).catch(() => {
      // Keep default status on error
    })

    // Subscribe to updates
    const unsubscribe = window.electronAPI?.onStatusUpdate((newStatus) => {
      setStatus(newStatus)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  // Auto-transition from "done" to "idle" after timeout
  useEffect(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current)
      idleTimeoutRef.current = null
    }

    if (status.primary.status === 'done') {
      idleTimeoutRef.current = setTimeout(() => {
        setStatus((prev) => ({
          ...prev,
          primary: {
            status: 'idle',
            action: 'Waiting for Agent...',
            timestamp: Date.now()
          }
        }))
      }, IDLE_TIMEOUT_MS)
    }

    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current)
      }
    }
  }, [status.primary.status])

  return status
}
