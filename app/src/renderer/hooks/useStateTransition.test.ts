import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStateTransition } from './useStateTransition'

describe('useStateTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial state immediately', () => {
    const { result } = renderHook(() => useStateTransition('idle'))

    expect(result.current.currentState).toBe('idle')
    expect(result.current.isTransitioning).toBe(false)
  })

  it('sets isTransitioning to true during state change', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 'idle' } }
    )

    expect(result.current.isTransitioning).toBe(false)

    rerender({ state: 'working' })

    expect(result.current.isTransitioning).toBe(true)
    expect(result.current.currentState).toBe('idle')
  })

  it('updates currentState after 150ms delay', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 'idle' } }
    )

    rerender({ state: 'working' })

    expect(result.current.currentState).toBe('idle')
    expect(result.current.isTransitioning).toBe(true)

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(result.current.currentState).toBe('working')
    expect(result.current.isTransitioning).toBe(false)
  })

  it('cleans up timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { result, rerender, unmount } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 'idle' } }
    )

    rerender({ state: 'working' })

    expect(result.current.isTransitioning).toBe(true)

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('handles rapid state changes - only final state applies', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 'idle' } }
    )

    // Rapid state changes
    rerender({ state: 'working' })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    rerender({ state: 'reading' })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    rerender({ state: 'done' })

    // Should still be in original state as no timeout completed
    expect(result.current.currentState).toBe('idle')
    expect(result.current.isTransitioning).toBe(true)

    // After 150ms from last change, should update to final state
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(result.current.currentState).toBe('done')
    expect(result.current.isTransitioning).toBe(false)
  })

  it('does not transition when state stays the same', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 'idle' } }
    )

    rerender({ state: 'idle' })

    expect(result.current.isTransitioning).toBe(false)
    expect(result.current.currentState).toBe('idle')
  })

  it('works with different state types', () => {
    const { result, rerender } = renderHook(
      ({ state }) => useStateTransition(state),
      { initialProps: { state: 1 } }
    )

    expect(result.current.currentState).toBe(1)

    rerender({ state: 2 })

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(result.current.currentState).toBe(2)
  })
})
