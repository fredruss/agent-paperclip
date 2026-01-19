import { contextBridge, ipcRenderer } from 'electron'
import type { Status, StatusCallback, PackCallback } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  getStatus: (): Promise<Status> => ipcRenderer.invoke('get-status'),
  onStatusUpdate: (callback: StatusCallback): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Status): void => {
      callback(status)
    }
    ipcRenderer.on('status-update', handler)
    return () => {
      ipcRenderer.removeListener('status-update', handler)
    }
  },
  startDrag: (): void => {
    ipcRenderer.send('start-drag')
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
