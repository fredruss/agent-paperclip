import { useEffect, useState } from 'react'
import type { UsageInfo } from '../../shared/types'

export type { UsageInfo }

export function useUsage(): UsageInfo | null {
  const [usage, setUsage] = useState<UsageInfo | null>(null)

  useEffect(() => {
    let disposed = false
    const api = window.electronAPI
    if (!api) return

    const unsubscribe = api.onUsageUpdate((next) => {
      if (disposed) return
      setUsage(next)
    })

    api.getUsage().then((initial) => {
      if (disposed) return
      setUsage((prev) => prev ?? initial)
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
