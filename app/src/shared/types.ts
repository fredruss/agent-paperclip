export type PetState = 'idle' | 'thinking' | 'working' | 'reading' | 'waiting' | 'done' | 'error'

export interface TokenUsage {
  context: number // Total context tokens (input + cache_creation + cache_read)
  output: number
}

export interface Status {
  status: PetState
  action: string
  timestamp: number
  usage?: TokenUsage
}

export type SessionSource = 'claude-code' | 'codex'

export interface SessionInfo {
  sessionId: string
  source: SessionSource
  status: PetState
  action: string
  usage?: TokenUsage
}

export interface MultiSessionStatus {
  primary: Status
  sessions: SessionInfo[]
  sessionCount: number
}

export type MultiSessionCallback = (status: MultiSessionStatus) => void
export type PackCallback = (packId: string) => void

export interface UsageInfo {
  source: SessionSource
  usedPercentage: number
  resetsAt: number
  updatedAt: number
}

export type UsageCallback = (usage: UsageInfo | null) => void

export interface ElectronAPI {
  getStatus: () => Promise<MultiSessionStatus>
  onStatusUpdate: (callback: MultiSessionCallback) => () => void
  getUsage: () => Promise<UsageInfo | null>
  onUsageUpdate: (callback: UsageCallback) => () => void
  dragStart: (x: number, y: number) => void
  dragMove: (x: number, y: number) => void
  dragEnd: () => void
  getActivePack: () => Promise<string>
  showPackMenu: () => void
  onPackChanged: (callback: PackCallback) => () => void
  getSoundEnabled: () => Promise<boolean>
  onSoundChanged: (callback: (enabled: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
