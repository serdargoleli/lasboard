import { contextBridge, ipcRenderer } from 'electron'
import type { ClipboardApi, ClipboardItem, ClipboardSettings } from '../shared/types'

const api: ClipboardApi = {
  listItems: () => ipcRenderer.invoke('items:list'),
  copyItem: (id) => ipcRenderer.invoke('items:copy', id),
  deleteItem: (id) => ipcRenderer.invoke('items:delete', id),
  clearHistory: () => ipcRenderer.invoke('items:clear'),
  pinItem: (id, pinned) => ipcRenderer.invoke('items:pin', id, pinned),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings: Partial<ClipboardSettings>) => ipcRenderer.invoke('settings:update', settings),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getLogoUrl: () => ipcRenderer.invoke('app:logo-url'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  onItemsChanged: (callback: (items: ClipboardItem[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, items: ClipboardItem[]) => callback(items)
    ipcRenderer.on('items:changed', listener)
    return () => ipcRenderer.removeListener('items:changed', listener)
  }
}

contextBridge.exposeInMainWorld('clipboardApi', api)
