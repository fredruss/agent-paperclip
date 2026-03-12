import { useEffect, useRef } from 'react'
import type { PetState } from '../../shared/types'
import finishSound from '../assets/sounds/finish-notification.wav'
import popSound from '../assets/sounds/pop-notification.wav'

const sounds: Partial<Record<PetState, string>> = {
  done: finishSound,
  waiting: popSound
}

export function useSound(state: PetState): void {
  const prevStateRef = useRef<PetState>(state)
  const enabledRef = useRef<boolean | null>(null)
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

    const src = sounds[state]
    if (src) {
      new Audio(src).play()
    }
  }, [state])
}
