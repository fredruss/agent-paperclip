import { contextBridge, ipcRenderer } from 'electron'
import type { MultiSessionStatus, MultiSessionCallback, PackCallback } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: (): Promise<MultiSessionStatus> => ipcRenderer.invoke('get-status'),
  onStatusUpdate: (callback: MultiSessionCallback): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: MultiSessionStatus): void => {
      callback(status)
    }
    ipcRenderer.on('status-update', handler)
    return () => {
      ipcRenderer.removeListener('status-update', handler)
    }
  },
  dragStart: (x: number, y: number): void => {
    ipcRenderer.send('drag-start', { x, y })
  },
  dragMove: (x: number, y: number): void => {
    ipcRenderer.send('drag-move', { x, y })
  },
  dragEnd: (): void => {
    ipcRenderer.send('drag-end')
  },
  getActivePack: (): Promise<string> => ipcRenderer.invoke('get-active-pack'),
  showPackMenu: (): void => {
    ipcRenderer.send('show-pack-menu')
  },
  onPackChanged: (callback: PackCallback): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, packId: string): void => {
      callback(packId)
    }
    ipcRenderer.on('pack-changed', handler)
    return () => {
      ipcRenderer.removeListener('pack-changed', handler)
    }
  }
})
