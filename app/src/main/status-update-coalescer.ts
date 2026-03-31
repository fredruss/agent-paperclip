export interface StatusUpdateCoalescerOptions<T> {
  delayMs: number
  load: () => Promise<T>
  emit: (status: T) => void
  serialize?: (status: T) => string
  onSend?: (status: T, reasons: string[]) => void
  onSkip?: (status: T, reasons: string[]) => void
}

export interface StatusUpdateCoalescer {
  schedule: (reason: string) => void
  cancel: () => void
}

export function createStatusUpdateCoalescer<T>(
  options: StatusUpdateCoalescerOptions<T>
): StatusUpdateCoalescer {
  const serialize = options.serialize ?? JSON.stringify
  const pendingReasons = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing = false
  let lastSerializedStatus: string | null = null

  const startTimer = (): void => {
    if (timer || flushing) return

    timer = setTimeout(() => {
      timer = null
      flush().catch(() => {
        // Best effort; the next file event will retry.
      })
    }, options.delayMs)
  }

  const flush = async (): Promise<void> => {
    if (flushing || pendingReasons.size === 0) return

    flushing = true
    const reasons = Array.from(pendingReasons)
    pendingReasons.clear()

    try {
      const status = await options.load()
      const serializedStatus = serialize(status)

      if (serializedStatus === lastSerializedStatus) {
        options.onSkip?.(status, reasons)
        return
      }

      lastSerializedStatus = serializedStatus
      options.onSend?.(status, reasons)
      options.emit(status)
    } finally {
      flushing = false
      if (pendingReasons.size > 0) {
        startTimer()
      }
    }
  }

  return {
    schedule(reason: string): void {
      pendingReasons.add(reason)
      startTimer()
    },
    cancel(): void {
      pendingReasons.clear()
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
