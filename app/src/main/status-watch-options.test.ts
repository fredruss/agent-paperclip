// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { getStatusWatchOptions } from './status-watch-options'

const originalPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
})

describe('getStatusWatchOptions', () => {
  it('enables polling on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })

    expect(getStatusWatchOptions()).toEqual({
      persistent: true,
      ignoreInitial: false,
      usePolling: true,
      interval: 250
    })
  })

  it('does not enable polling on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    expect(getStatusWatchOptions()).toEqual({
      persistent: true,
      ignoreInitial: false
    })
  })
})
