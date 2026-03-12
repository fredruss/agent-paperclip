import { useState, useEffect, useRef } from 'react'
import type { MultiSessionStatus } from '../../shared/types'

export type { MultiSessionStatus }

export type StatusUpdateSource = 'snapshot' | 'live' | 'local'

export interface UseStatusResult extends MultiSessionStatus {
  isHydrated: boolean
  lastUpdateSource: StatusUpdateSource
}

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

export function useStatus(): UseStatusResult {
  const [status, setStatus] = useState<UseStatusResult>({
    ...defaultStatus,
    isHydrated: false,
    lastUpdateSource: 'snapshot'
  })
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestStatusTimestampRef = useRef(0)

  useEffect(() => {
    let disposed = false
    let sawLiveUpdate = false
    const api = window.electronAPI

    const markHydrated = (): void => {
      setStatus((prev) => (prev.isHydrated ? prev : { ...prev, isHydrated: true }))
    }

    if (!api) {
      markHydrated()
      return
    }

    const unsubscribe = api.onStatusUpdate((newStatus) => {
      if (disposed) return

      sawLiveUpdate = true
      latestStatusTimestampRef.current = Math.max(latestStatusTimestampRef.current, newStatus.primary.timestamp)
      setStatus({
        ...newStatus,
        isHydrated: true,
        lastUpdateSource: 'live'
      })
    })

    api.getStatus().then((initialStatus) => {
      if (disposed) return

      if (!sawLiveUpdate || initialStatus.primary.timestamp > latestStatusTimestampRef.current) {
        latestStatusTimestampRef.current = Math.max(latestStatusTimestampRef.current, initialStatus.primary.timestamp)
        setStatus({
          ...initialStatus,
          isHydrated: true,
          lastUpdateSource: 'snapshot'
        })
        return
      }

      markHydrated()
    }).catch(() => {
      if (!disposed) {
        markHydrated()
      }
    })

    return () => {
      disposed = true
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
        const timestamp = Date.now()
        latestStatusTimestampRef.current = Math.max(latestStatusTimestampRef.current, timestamp)
        setStatus((prev) => ({
          ...prev,
          primary: {
            status: 'idle',
            action: 'Waiting for Agent...',
            timestamp
          },
          lastUpdateSource: 'local'
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
