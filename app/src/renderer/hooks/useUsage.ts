import { useEffect, useRef, useState } from 'react'
import type { UsageInfo } from '../../shared/types'

export type { UsageInfo }

export function useUsage(): UsageInfo | null {
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const liveApplied = useRef(false)

  useEffect(() => {
    let disposed = false
    const api = window.electronAPI
    if (!api) return

    const unsubscribe = api.onUsageUpdate((next) => {
      if (disposed) return
      liveApplied.current = true
      setUsage(next)
    })

    api.getUsage().then((initial) => {
      if (disposed || liveApplied.current) return
      setUsage(initial)
    }).catch(() => {
      // Leave usage null on failure
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  return usage
}
