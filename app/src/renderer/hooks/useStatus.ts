import { useState, useEffect, useRef } from 'react'
import type { Status } from '../../shared/types'

export type { Status }

const defaultStatus: Status = {
  status: 'idle',
  action: 'Waiting for Agent...',
  timestamp: Date.now()
}

const IDLE_TIMEOUT_MS = 4000

export function useStatus(): Status {
  const [status, setStatus] = useState<Status>(defaultStatus)
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

    if (status.status === 'done') {
      idleTimeoutRef.current = setTimeout(() => {
        setStatus({
          status: 'idle',
          action: 'Waiting for Agent...',
          timestamp: Date.now()
        })
      }, IDLE_TIMEOUT_MS)
    }

    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current)
      }
    }
  }, [status.status])

  return status
}
