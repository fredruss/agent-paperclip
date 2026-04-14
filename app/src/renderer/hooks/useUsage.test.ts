import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUsage } from './useUsage'
import type { ElectronAPI, UsageCallback, UsageInfo } from '../../shared/types'

describe('useUsage', () => {
  let mockGetUsage: ReturnType<typeof vi.fn>
  let mockOnUsageUpdate: ReturnType<typeof vi.fn>
  let mockUnsubscribe: ReturnType<typeof vi.fn>
  let usageCallback: UsageCallback | null = null

  beforeEach(() => {
    mockGetUsage = vi.fn()
    mockUnsubscribe = vi.fn()
    mockOnUsageUpdate = vi.fn((callback: UsageCallback) => {
      usageCallback = callback
      return mockUnsubscribe
    })

    window.electronAPI = {
      getStatus: vi.fn(),
      onStatusUpdate: vi.fn(),
      getUsage: mockGetUsage,
      onUsageUpdate: mockOnUsageUpdate,
      dragStart: vi.fn(),
      dragMove: vi.fn(),
      dragEnd: vi.fn(),
      getActivePack: vi.fn(),
      showPackMenu: vi.fn(),
      onPackChanged: vi.fn(),
      getSoundEnabled: vi.fn(),
      onSoundChanged: vi.fn()
    } as unknown as ElectronAPI
  })

  afterEach(() => {
    usageCallback = null
    vi.restoreAllMocks()
    // @ts-expect-error - cleaning up mock
    delete window.electronAPI
  })

  it('starts null when no data available', () => {
    mockGetUsage.mockResolvedValue(null)
    const { result } = renderHook(() => useUsage())
    expect(result.current).toBeNull()
  })

  it('returns usage from initial snapshot', async () => {
    const snapshot: UsageInfo = { usedPercentage: 42, resetsAt: 100, updatedAt: 50 }
    mockGetUsage.mockResolvedValue(snapshot)

    const { result } = renderHook(() => useUsage())

    await act(async () => {
      await mockGetUsage.mock.results[0]?.value
    })

    expect(result.current).toEqual(snapshot)
  })

  it('updates when live callback fires', async () => {
    mockGetUsage.mockResolvedValue(null)
    const { result } = renderHook(() => useUsage())

    await act(async () => {
      await mockGetUsage.mock.results[0]?.value
    })

    const live: UsageInfo = { usedPercentage: 85, resetsAt: 200, updatedAt: 100 }
    act(() => {
      usageCallback?.(live)
    })

    expect(result.current).toEqual(live)
  })

  it('prefers live update over late-arriving initial snapshot', async () => {
    let resolveSnapshot: (value: UsageInfo | null) => void = () => {}
    mockGetUsage.mockReturnValue(
      new Promise<UsageInfo | null>((resolve) => {
        resolveSnapshot = resolve
      })
    )

    const { result } = renderHook(() => useUsage())

    const live: UsageInfo = { usedPercentage: 50, resetsAt: 200, updatedAt: 100 }
    act(() => {
      usageCallback?.(live)
    })

    expect(result.current).toEqual(live)

    await act(async () => {
      resolveSnapshot({ usedPercentage: 10, resetsAt: 50, updatedAt: 10 })
    })

    expect(result.current).toEqual(live)
  })

  it('cleans up subscription on unmount', async () => {
    mockGetUsage.mockResolvedValue(null)
    const { unmount } = renderHook(() => useUsage())

    await act(async () => {
      await mockGetUsage.mock.results[0]?.value
    })

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('returns null when electronAPI is missing', () => {
    // @ts-expect-error - testing missing API
    delete window.electronAPI
    const { result } = renderHook(() => useUsage())
    expect(result.current).toBeNull()
  })
})
