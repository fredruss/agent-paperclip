import { type ReactNode, type MouseEvent, useState, useEffect } from 'react'
import { useStateTransition } from '../hooks/useStateTransition'
import { getPackById, type StickerPack } from '../stickers'
import type { PetState } from '../../shared/types'
import './Pet.css'

interface PetProps {
  state: PetState
}

export function Pet({ state }: PetProps): ReactNode {
  const { currentState, isTransitioning } = useStateTransition(state)
  const [pack, setPack] = useState<StickerPack>(() => getPackById('default'))

  useEffect(() => {
    // Load initial pack from main process
    window.electronAPI.getActivePack()
      .then((packId) => {
        setPack(getPackById(packId))
      })
      .catch(() => {
        // Keep default pack on error
      })

    // Listen for pack changes
    const cleanup = window.electronAPI.onPackChanged((packId) => {
      setPack(getPackById(packId))
    })

    return cleanup
  }, [])

  const handleContextMenu = (e: MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    window.electronAPI.showPackMenu()
  }

  return (
    <div
      className={`pet-container ${isTransitioning ? 'transitioning' : ''} pet-${currentState}`}
      onContextMenu={handleContextMenu}
    >
      {pack.type === 'svg' ? (
        pack.faces[currentState]
      ) : (
        <img src={pack.faces[currentState]} alt={currentState} className="pet-image" />
      )}
    </div>
  )
}
