import type { SvgStickerPack } from './index'

export const defaultPack: SvgStickerPack = {
  id: 'default',
  name: 'Default',
  type: 'svg',
  faces: {
    idle: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#FFB347" />
        <circle cx="35" cy="40" r="5" fill="#333" />
        <circle cx="65" cy="40" r="5" fill="#333" />
        <path d="M 35 60 Q 50 70 65 60" stroke="#333" strokeWidth="3" fill="none" />
      </svg>
    ),
    thinking: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#B8A9E8" />
        {/* Eyes looking up */}
        <circle cx="35" cy="38" r="6" fill="#fff" />
        <circle cx="65" cy="38" r="6" fill="#fff" />
        <circle cx="35" cy="35" r="3" fill="#333" />
        <circle cx="65" cy="35" r="3" fill="#333" />
        {/* Slight smile */}
        <path d="M 40 62 Q 50 68 60 62" stroke="#333" strokeWidth="2" fill="none" />
        {/* Thought dots */}
        <circle cx="78" cy="25" r="3" fill="#333" className="thought-dot-1" />
        <circle cx="85" cy="15" r="4" fill="#333" className="thought-dot-2" />
        <circle cx="92" cy="5" r="5" fill="#333" className="thought-dot-3" />
      </svg>
    ),
    working: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#87CEEB" />
        <circle cx="35" cy="40" r="5" fill="#333" />
        <circle cx="65" cy="40" r="5" fill="#333" />
        <path d="M 35 62 Q 50 75 65 62" stroke="#333" strokeWidth="3" fill="none" />
        <text x="50" y="85" textAnchor="middle" fontSize="12" fill="#333">
          ...
        </text>
      </svg>
    ),
    reading: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#DDA0DD" />
        <ellipse cx="35" cy="40" rx="8" ry="5" fill="#333" />
        <ellipse cx="65" cy="40" rx="8" ry="5" fill="#333" />
        <circle cx="37" cy="39" r="2" fill="#fff" />
        <circle cx="67" cy="39" r="2" fill="#fff" />
        <path d="M 40 60 L 60 60" stroke="#333" strokeWidth="2" />
      </svg>
    ),
    waiting: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#FFD93D" />
        {/* Question mark eyes */}
        <text x="35" y="48" textAnchor="middle" fontSize="20" fill="#333" className="waiting-eye">
          ?
        </text>
        <text x="65" y="48" textAnchor="middle" fontSize="20" fill="#333" className="waiting-eye">
          ?
        </text>
        {/* Slightly open mouth */}
        <ellipse cx="50" cy="65" rx="8" ry="5" fill="#333" />
      </svg>
    ),
    done: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#90EE90" />
        <path d="M 30 40 Q 35 35 40 40" stroke="#333" strokeWidth="2" fill="none" />
        <path d="M 60 40 Q 65 35 70 40" stroke="#333" strokeWidth="2" fill="none" />
        <path d="M 30 60 Q 50 80 70 60" stroke="#333" strokeWidth="3" fill="none" />
      </svg>
    ),
    error: (
      <svg viewBox="0 0 100 100" className="pet-svg">
        <circle cx="50" cy="50" r="45" fill="#FFB6C1" />
        <line x1="30" y1="35" x2="40" y2="45" stroke="#333" strokeWidth="3" />
        <line x1="40" y1="35" x2="30" y2="45" stroke="#333" strokeWidth="3" />
        <line x1="60" y1="35" x2="70" y2="45" stroke="#333" strokeWidth="3" />
        <line x1="70" y1="35" x2="60" y2="45" stroke="#333" strokeWidth="3" />
        <path d="M 35 70 Q 50 60 65 70" stroke="#333" strokeWidth="3" fill="none" />
      </svg>
    )
  }
}
