import { useEffect, useRef } from 'react'
import type { PetState } from '../../shared/types'

function playCompletionTone(ctx: AudioContext): void {
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.connect(ctx.destination)
  gain.gain.setValueAtTime(0.15, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)

  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(587, now) // D5
  osc1.connect(gain)
  osc1.start(now)
  osc1.stop(now + 0.15)

  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(784, now + 0.15) // G5
  osc2.connect(gain)
  osc2.start(now + 0.15)
  osc2.stop(now + 0.4)
}

function playWaitingTone(ctx: AudioContext): void {
  const now = ctx.currentTime

  for (let i = 0; i < 2; i++) {
    const offset = i * 0.2
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.12, now + offset)
    gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.15)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now + offset) // A5
    osc.connect(gain)
    osc.start(now + offset)
    osc.stop(now + offset + 0.15)
  }
}

export function useSound(state: PetState): void {
  const prevStateRef = useRef<PetState>(state)
  const enabledRef = useRef<boolean | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    window.electronAPI
      .getSoundEnabled()
      .then((enabled) => {
        enabledRef.current = enabled
      })
      .catch(() => {
        enabledRef.current = true
      })
    // Mark ready after the first paint — by then the initial getStatus()
    // hydration has been processed, so any further transitions are live.
    requestAnimationFrame(() => {
      readyRef.current = true
    })
    return window.electronAPI.onSoundChanged((enabled) => {
      enabledRef.current = enabled
    })
  }, [])

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = state

    if (!readyRef.current || enabledRef.current !== true || prev === state) return

    if (state === 'done' || state === 'waiting') {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      if (state === 'done') {
        playCompletionTone(ctx)
      } else {
        playWaitingTone(ctx)
      }
    }
  }, [state])
}
