import { useEffect, useRef } from 'react'
import type { PetState } from '../../shared/types'
import type { StatusUpdateSource } from './useStatus'
import finishSound from '../assets/sounds/finish-notification.wav'
import popSound from '../assets/sounds/pop-notification.wav'

const sounds: Partial<Record<PetState, string>> = {
  done: finishSound,
  waiting: popSound
}

export function useSound(state: PetState, isHydrated: boolean, lastUpdateSource: StatusUpdateSource): void {
  const prevStateRef = useRef<PetState>(state)
  const enabledRef = useRef<boolean | null>(null)

  useEffect(() => {
    const api = window.electronAPI

    if (!api) {
      enabledRef.current = true
      return
    }

    api.getSoundEnabled().then((enabled) => {
      enabledRef.current = enabled
    }).catch(() => {
      enabledRef.current = true
    })

    return api.onSoundChanged((enabled) => {
      enabledRef.current = enabled
    })
  }, [])

  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = state

    if (!isHydrated || lastUpdateSource !== 'live' || enabledRef.current !== true || prev === state) return

    const src = sounds[state]
    if (src) {
      new Audio(src).play().catch(() => {})
    }
  }, [isHydrated, lastUpdateSource, state])
}
