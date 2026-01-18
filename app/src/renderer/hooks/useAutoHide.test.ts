import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoHide } from './useAutoHide'

describe('useAutoHide', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true initially', () => {
    const { result } = renderHook(() => useAutoHide(false, 1000, []))

    expect(result.current).toBe(true)
  })

  it('returns false after delay when shouldHide is true', () => {
    const { result } = renderHook(() => useAutoHide(true, 1000, []))

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current).toBe(false)
  })

  it('does not hide when shouldHide is false', () => {
    const { result } = renderHook(() => useAutoHide(false, 1000, []))

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current).toBe(true)
  })

  it('resets timer when dependencies change', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAutoHide(true, 1000, deps),
      { initialProps: { deps: ['a'] } }
    )

    // Advance time partially
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(true)

    // Change dependencies - should reset timer and become visible again
    rerender({ deps: ['b'] })

    expect(result.current).toBe(true)

    // Advance time partially again
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(true)

    // Complete the full delay from the reset
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current).toBe(false)
  })

  it('uses custom delay when provided', () => {
    const { result } = renderHook(() => useAutoHide(true, 500, []))

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe(false)
  })

  it('cleans up timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { unmount } = renderHook(() => useAutoHide(true, 1000, []))

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('resets visibility when shouldHide changes from true to false', () => {
    const { result, rerender } = renderHook(
      ({ shouldHide }) => useAutoHide(shouldHide, 1000, []),
      { initialProps: { shouldHide: true } }
    )

    // Let it hide
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current).toBe(false)

    // Change shouldHide to false - should become visible again
    rerender({ shouldHide: false })

    expect(result.current).toBe(true)
  })

  it('resets visibility when delay changes', () => {
    const { result, rerender } = renderHook(
      ({ delay }) => useAutoHide(true, delay, []),
      { initialProps: { delay: 1000 } }
    )

    // Let it hide
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current).toBe(false)

    // Change delay - should become visible again and start new timer
    rerender({ delay: 2000 })

    expect(result.current).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current).toBe(false)
  })

  it('handles multiple dependencies', () => {
    const { result, rerender } = renderHook(
      ({ deps }) => useAutoHide(true, 1000, deps),
      { initialProps: { deps: ['a', 'b', 'c'] as unknown[] } }
    )

    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(result.current).toBe(true)

    // Change one dependency
    rerender({ deps: ['a', 'b', 'd'] })

    expect(result.current).toBe(true)

    // Previous timer was cleared, new timer started
    act(() => {
      vi.advanceTimersByTime(800)
    })

    expect(result.current).toBe(true)

    // Complete the new timer
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current).toBe(false)
  })
})
