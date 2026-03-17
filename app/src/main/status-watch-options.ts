export const WINDOWS_STATUS_POLL_INTERVAL_MS = 250

export interface StatusWatchOptions {
  persistent: true
  ignoreInitial: false
  usePolling?: true
  interval?: number
}

export function getStatusWatchOptions(): StatusWatchOptions {
  return {
    persistent: true,
    ignoreInitial: false,
    ...(process.platform === 'win32' ? { usePolling: true, interval: WINDOWS_STATUS_POLL_INTERVAL_MS } : {})
  }
}
