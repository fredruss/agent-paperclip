import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSound } from './useSound'
import type { ElectronAPI } from '../../shared/types'
import type { StatusUpdateSource } from './useStatus'

vi.mock('../assets/sounds/finish-notification.wav', () => ({
  default: 'finish-notification.wav'
}))

vi.mock('../assets/sounds/pop-notification.wav', () => ({
  default: 'pop-notification.wav'
}))

describe('useSound', () => {
  let mockGetSoundEnabled: ReturnType<typeof vi.fn>
  let mockOnSoundChanged: ReturnType<typeof vi.fn>
  let mockUnsubscribe: ReturnType<typeof vi.fn>
  let audioConstructorSpy: ReturnType<typeof vi.fn>
  let playSpy: ReturnType<typeof vi.fn>
  let soundChangedCallback: ((enabled: boolean) => void) | null

  beforeEach(() => {
    mockGetSoundEnabled = vi.fn().mockResolvedValue(true)
    mockUnsubscribe = vi.fn()
    soundChangedCallback = null
    mockOnSoundChanged = vi.fn((callback: (enabled: boolean) => void) => {
      soundChangedCallback = callback
      return mockUnsubscribe
    })
    playSpy = vi.fn().mockResolvedValue(undefined)
    audioConstructorSpy = vi.fn(function (this: { play: typeof playSpy }) {
      this.play = playSpy
    })

    vi.stubGlobal('Audio', audioConstructorSpy)

    window.electronAPI = {
      getStatus: vi.fn(),
      onStatusUpdate: vi.fn(),
      dragStart: vi.fn(),
      dragMove: vi.fn(),
      dragEnd: vi.fn(),
      getActivePack: vi.fn(),
      showPackMenu: vi.fn(),
      onPackChanged: vi.fn(),
      getSoundEnabled: mockGetSoundEnabled,
      onSoundChanged: mockOnSoundChanged
    } as unknown as ElectronAPI
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // @ts-expect-error - cleaning up mock
    delete window.electronAPI
  })

  it('does not play for a snapshot hydration into a notification state', async () => {
    const { rerender } = renderHook(
      ({ state, isHydrated, lastUpdateSource }: { state: 'idle' | 'done'; isHydrated: boolean; lastUpdateSource: StatusUpdateSource }) =>
        useSound(state, isHydrated, lastUpdateSource),
      {
        initialProps: {
          state: 'idle',
          isHydrated: false,
          lastUpdateSource: 'snapshot' as StatusUpdateSource
        }
      }
    )

    await act(async () => {
      await mockGetSoundEnabled.mock.results[0]?.value
    })

    rerender({
      state: 'done',
      isHydrated: true,
      lastUpdateSource: 'snapshot'
    })

    expect(audioConstructorSpy).not.toHaveBeenCalled()
    expect(playSpy).not.toHaveBeenCalled()
  })

  it('plays for the first live notification transition after hydration', async () => {
    const { rerender } = renderHook(
      ({ state, isHydrated, lastUpdateSource }: { state: 'idle' | 'done'; isHydrated: boolean; lastUpdateSource: StatusUpdateSource }) =>
        useSound(state, isHydrated, lastUpdateSource),
      {
        initialProps: {
          state: 'idle',
          isHydrated: true,
          lastUpdateSource: 'snapshot' as StatusUpdateSource
        }
      }
    )

    await act(async () => {
      await mockGetSoundEnabled.mock.results[0]?.value
    })

    rerender({
      state: 'done',
      isHydrated: true,
      lastUpdateSource: 'live'
    })

    expect(audioConstructorSpy).toHaveBeenCalledWith('finish-notification.wav')
    expect(playSpy).toHaveBeenCalledTimes(1)
  })

  it('respects sound preference updates from the main process', async () => {
    const { rerender } = renderHook(
      ({ state, isHydrated, lastUpdateSource }: { state: 'idle' | 'done'; isHydrated: boolean; lastUpdateSource: StatusUpdateSource }) =>
        useSound(state, isHydrated, lastUpdateSource),
      {
        initialProps: {
          state: 'idle',
          isHydrated: true,
          lastUpdateSource: 'snapshot' as StatusUpdateSource
        }
      }
    )

    await act(async () => {
      await mockGetSoundEnabled.mock.results[0]?.value
    })

    act(() => {
      soundChangedCallback?.(false)
    })

    rerender({
      state: 'done',
      isHydrated: true,
      lastUpdateSource: 'live'
    })

    expect(playSpy).not.toHaveBeenCalled()
  })

  it('cleans up the sound subscription on unmount', async () => {
    const { unmount } = renderHook(() => useSound('idle', true, 'snapshot'))

    await act(async () => {
      await mockGetSoundEnabled.mock.results[0]?.value
    })

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
