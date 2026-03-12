import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatus } from './useStatus'
import type { ElectronAPI, MultiSessionStatus, MultiSessionCallback } from '../../shared/types'

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function makeMultiStatus(overrides: Partial<MultiSessionStatus> = {}): MultiSessionStatus {
  return {
    primary: { status: 'idle', action: 'Waiting for Agent...', timestamp: Date.now() },
    sessions: [],
    sessionCount: 0,
    ...overrides
  }
}

describe('useStatus', () => {
  let mockGetStatus: ReturnType<typeof vi.fn>
  let mockOnStatusUpdate: ReturnType<typeof vi.fn>
  let mockUnsubscribe: ReturnType<typeof vi.fn>
  let statusCallback: MultiSessionCallback | null = null

  beforeEach(() => {
    mockGetStatus = vi.fn()
    mockUnsubscribe = vi.fn()
    mockOnStatusUpdate = vi.fn((callback: MultiSessionCallback) => {
      statusCallback = callback
      return mockUnsubscribe
    })

    // Set up the mock electronAPI
    window.electronAPI = {
      getStatus: mockGetStatus,
      onStatusUpdate: mockOnStatusUpdate,
      dragStart: vi.fn(),
      dragMove: vi.fn(),
      dragEnd: vi.fn(),
      getActivePack: vi.fn(),
      showPackMenu: vi.fn(),
      onPackChanged: vi.fn(),
      getSoundEnabled: vi.fn(),
      onSoundChanged: vi.fn(),
    } as unknown as ElectronAPI
  })

  afterEach(() => {
    statusCallback = null
    vi.restoreAllMocks()
    // @ts-expect-error - cleaning up mock
    delete window.electronAPI
  })

  it('fetches initial status on mount', async () => {
    const initialStatus = makeMultiStatus({
      primary: { status: 'working', action: 'Working...', timestamp: Date.now() },
      sessionCount: 1,
      sessions: [{ sessionId: 's1', source: 'claude-code', status: 'working', action: 'Working...' }]
    })
    mockGetStatus.mockResolvedValue(initialStatus)

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(mockGetStatus).toHaveBeenCalledTimes(1)
    expect(result.current.primary.status).toBe('working')
    expect(result.current.primary.action).toBe('Working...')
    expect(result.current.sessionCount).toBe(1)
    expect(result.current.isHydrated).toBe(true)
    expect(result.current.lastUpdateSource).toBe('snapshot')
  })

  it('updates status when IPC callback fires', async () => {
    mockGetStatus.mockResolvedValue(makeMultiStatus())

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(mockOnStatusUpdate).toHaveBeenCalled()

    const newStatus = makeMultiStatus({
      primary: { status: 'reading', action: 'Reading file...', timestamp: Date.now() },
      sessionCount: 1,
      sessions: [{ sessionId: 's1', source: 'claude-code', status: 'reading', action: 'Reading file...' }]
    })

    act(() => {
      statusCallback?.(newStatus)
    })

    expect(result.current.primary.status).toBe('reading')
    expect(result.current.primary.action).toBe('Reading file...')
    expect(result.current.isHydrated).toBe(true)
    expect(result.current.lastUpdateSource).toBe('live')
  })

  it('transitions from done to idle after 4000ms', async () => {
    vi.useFakeTimers()

    mockGetStatus.mockResolvedValue(makeMultiStatus())

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const doneStatus = makeMultiStatus({
      primary: { status: 'done', action: 'All done!', timestamp: Date.now() }
    })

    act(() => {
      statusCallback?.(doneStatus)
    })

    expect(result.current.primary.status).toBe('done')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(result.current.primary.status).toBe('idle')
    expect(result.current.primary.action).toBe('Waiting for Agent...')
    expect(result.current.lastUpdateSource).toBe('local')

    vi.useRealTimers()
  })

  it('handles missing electronAPI gracefully', () => {
    // @ts-expect-error - testing missing API
    delete window.electronAPI

    const { result } = renderHook(() => useStatus())

    expect(result.current.primary.status).toBe('idle')
    expect(result.current.primary.action).toBe('Waiting for Agent...')
    expect(result.current.sessionCount).toBe(0)
    expect(result.current.isHydrated).toBe(true)
  })

  it('cleans up subscriptions on unmount', async () => {
    mockGetStatus.mockResolvedValue(makeMultiStatus())

    const { unmount } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(mockOnStatusUpdate).toHaveBeenCalled()

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('cleans up idle timeout on unmount', async () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    mockGetStatus.mockResolvedValue(makeMultiStatus())

    const { unmount } = renderHook(() => useStatus())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const doneStatus = makeMultiStatus({
      primary: { status: 'done', action: 'All done!', timestamp: Date.now() }
    })

    act(() => {
      statusCallback?.(doneStatus)
    })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('clears previous idle timeout when status changes', async () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    mockGetStatus.mockResolvedValue(makeMultiStatus())

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    act(() => {
      statusCallback?.(makeMultiStatus({
        primary: { status: 'done', action: 'All done!', timestamp: Date.now() }
      }))
    })

    expect(result.current.primary.status).toBe('done')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    act(() => {
      statusCallback?.(makeMultiStatus({
        primary: { status: 'working', action: 'Working...', timestamp: Date.now() }
      }))
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(result.current.primary.status).toBe('working')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(result.current.primary.status).toBe('working')

    vi.useRealTimers()
  })

  it('handles getStatus error gracefully', async () => {
    mockGetStatus.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      try {
        await mockGetStatus.mock.results[0]?.value
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.primary.status).toBe('idle')
    expect(result.current.primary.action).toBe('Waiting for Agent...')
    expect(result.current.isHydrated).toBe(true)
  })

  it('includes usage data when present', async () => {
    const statusWithUsage = makeMultiStatus({
      primary: {
        status: 'working',
        action: 'Working...',
        timestamp: Date.now(),
        usage: { context: 1000, output: 500 }
      },
      sessions: [{
        sessionId: 's1',
        source: 'claude-code',
        status: 'working',
        action: 'Working...',
        usage: { context: 1000, output: 500 }
      }],
      sessionCount: 1
    })
    mockGetStatus.mockResolvedValue(statusWithUsage)

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(result.current.primary.usage).toEqual({
      context: 1000,
      output: 500
    })
  })

  it('keeps a live update when the initial snapshot resolves later with an older timestamp', async () => {
    const snapshot = makeMultiStatus({
      primary: { status: 'done', action: 'All done!', timestamp: 100 }
    })
    const liveStatus = makeMultiStatus({
      primary: { status: 'working', action: 'Working...', timestamp: 200 },
      sessionCount: 1,
      sessions: [{ sessionId: 's1', source: 'claude-code', status: 'working', action: 'Working...' }]
    })
    const deferred = createDeferred<MultiSessionStatus>()

    mockGetStatus.mockReturnValue(deferred.promise)

    const { result } = renderHook(() => useStatus())

    act(() => {
      statusCallback?.(liveStatus)
    })

    expect(result.current.primary.status).toBe('working')
    expect(result.current.lastUpdateSource).toBe('live')
    expect(result.current.isHydrated).toBe(true)

    await act(async () => {
      deferred.resolve(snapshot)
      await deferred.promise
    })

    expect(result.current.primary.status).toBe('working')
    expect(result.current.primary.action).toBe('Working...')
    expect(result.current.lastUpdateSource).toBe('live')
  })
})
