// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createStatusUpdateCoalescer } from './status-update-coalescer'

describe('createStatusUpdateCoalescer', () => {
  it('coalesces rapid events into a single send', async () => {
    vi.useFakeTimers()

    const load = vi.fn().mockResolvedValue({ state: 'done' })
    const emit = vi.fn()
    const onSend = vi.fn()
    const coalescer = createStatusUpdateCoalescer({
      delayMs: 50,
      load,
      emit,
      onSend
    })

    coalescer.schedule('change:a')
    coalescer.schedule('change:b')

    await vi.advanceTimersByTimeAsync(50)

    expect(load).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith({ state: 'done' }, ['change:a', 'change:b'])
    expect(emit).toHaveBeenCalledWith({ state: 'done' })
  })

  it('skips consecutive duplicate statuses', async () => {
    vi.useFakeTimers()

    const load = vi.fn()
      .mockResolvedValueOnce({ state: 'done' })
      .mockResolvedValueOnce({ state: 'done' })
    const emit = vi.fn()
    const onSkip = vi.fn()
    const coalescer = createStatusUpdateCoalescer({
      delayMs: 50,
      load,
      emit,
      onSkip
    })

    coalescer.schedule('change:a')
    await vi.advanceTimersByTimeAsync(50)

    coalescer.schedule('change:b')
    await vi.advanceTimersByTimeAsync(50)

    expect(emit).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledWith({ state: 'done' }, ['change:b'])
  })

  it('sends again when the status changes', async () => {
    vi.useFakeTimers()

    const load = vi.fn()
      .mockResolvedValueOnce({ state: 'done' })
      .mockResolvedValueOnce({ state: 'working' })
    const emit = vi.fn()
    const coalescer = createStatusUpdateCoalescer({
      delayMs: 50,
      load,
      emit
    })

    coalescer.schedule('change:a')
    await vi.advanceTimersByTimeAsync(50)

    coalescer.schedule('change:b')
    await vi.advanceTimersByTimeAsync(50)

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenNthCalledWith(1, { state: 'done' })
    expect(emit).toHaveBeenNthCalledWith(2, { state: 'working' })
  })
})
