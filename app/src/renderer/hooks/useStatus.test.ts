import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatus } from './useStatus'
import type { Status, StatusCallback } from '../../shared/types'

describe('useStatus', () => {
  let mockGetStatus: ReturnType<typeof vi.fn>
  let mockOnStatusUpdate: ReturnType<typeof vi.fn>
  let mockUnsubscribe: ReturnType<typeof vi.fn>
  let statusCallback: StatusCallback | null = null

  beforeEach(() => {
    mockGetStatus = vi.fn()
    mockUnsubscribe = vi.fn()
    mockOnStatusUpdate = vi.fn((callback: StatusCallback) => {
      statusCallback = callback
      return mockUnsubscribe
    })

    // Set up the mock electronAPI
    window.electronAPI = {
      getStatus: mockGetStatus,
      onStatusUpdate: mockOnStatusUpdate,
      startDrag: vi.fn()
    }
  })

  afterEach(() => {
    statusCallback = null
    vi.restoreAllMocks()
    // @ts-expect-error - cleaning up mock
    delete window.electronAPI
  })

  it('fetches initial status on mount', async () => {
    const initialStatus: Status = {
      status: 'working',
      action: 'Working...',
      timestamp: Date.now()
    }
    mockGetStatus.mockResolvedValue(initialStatus)

    const { result } = renderHook(() => useStatus())

    // Wait for the promise to resolve
    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(mockGetStatus).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('working')
    expect(result.current.action).toBe('Working...')
  })

  it('updates status when IPC callback fires', async () => {
    mockGetStatus.mockResolvedValue({
      status: 'idle',
      action: 'Waiting...',
      timestamp: Date.now()
    })

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(mockOnStatusUpdate).toHaveBeenCalled()

    const newStatus: Status = {
      status: 'reading',
      action: 'Reading file...',
      timestamp: Date.now()
    }

    act(() => {
      statusCallback?.(newStatus)
    })

    expect(result.current.status).toBe('reading')
    expect(result.current.action).toBe('Reading file...')
  })

  it('transitions from done to idle after 4000ms', async () => {
    vi.useFakeTimers()

    mockGetStatus.mockResolvedValue({
      status: 'idle',
      action: 'Waiting...',
      timestamp: Date.now()
    })

    const { result } = renderHook(() => useStatus())

    // Manually resolve the promise since we're using fake timers
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const doneStatus: Status = {
      status: 'done',
      action: 'All done!',
      timestamp: Date.now()
    }

    act(() => {
      statusCallback?.(doneStatus)
    })

    expect(result.current.status).toBe('done')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.action).toBe('Waiting for Claude Code...')

    vi.useRealTimers()
  })

  it('handles missing electronAPI gracefully', () => {
    // @ts-expect-error - testing missing API
    delete window.electronAPI

    const { result } = renderHook(() => useStatus())

    // Should use default status
    expect(result.current.status).toBe('idle')
    expect(result.current.action).toBe('Waiting for Claude Code...')
  })

  it('cleans up subscriptions on unmount', async () => {
    mockGetStatus.mockResolvedValue({
      status: 'idle',
      action: 'Waiting...',
      timestamp: Date.now()
    })

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

    mockGetStatus.mockResolvedValue({
      status: 'idle',
      action: 'Waiting...',
      timestamp: Date.now()
    })

    const { unmount } = renderHook(() => useStatus())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Trigger done state to start idle timeout
    const doneStatus: Status = {
      status: 'done',
      action: 'All done!',
      timestamp: Date.now()
    }

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

    mockGetStatus.mockResolvedValue({
      status: 'idle',
      action: 'Waiting...',
      timestamp: Date.now()
    })

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Set to done
    act(() => {
      statusCallback?.({
        status: 'done',
        action: 'All done!',
        timestamp: Date.now()
      })
    })

    expect(result.current.status).toBe('done')

    // Advance time partially
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Change to working before idle timeout fires
    act(() => {
      statusCallback?.({
        status: 'working',
        action: 'Working...',
        timestamp: Date.now()
      })
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(result.current.status).toBe('working')

    // Advance time past when idle would have triggered
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    // Should still be working, not transitioned to idle
    expect(result.current.status).toBe('working')

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

    // Should still have default status
    expect(result.current.status).toBe('idle')
    expect(result.current.action).toBe('Waiting for Claude Code...')
  })

  it('includes usage data when present', async () => {
    const statusWithUsage: Status = {
      status: 'working',
      action: 'Working...',
      timestamp: Date.now(),
      usage: {
        input: 1000,
        output: 500,
        cacheRead: 200
      }
    }
    mockGetStatus.mockResolvedValue(statusWithUsage)

    const { result } = renderHook(() => useStatus())

    await act(async () => {
      await mockGetStatus.mock.results[0]?.value
    })

    expect(result.current.usage).toEqual({
      input: 1000,
      output: 500,
      cacheRead: 200
    })
  })
})
