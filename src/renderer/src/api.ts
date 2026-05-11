import type { ClipboardApi, ClipboardItem, ClipboardSettings } from '@shared/types'

const fallbackSettings: ClipboardSettings = {
  maxItems: 100,
  hotkey: 'CommandOrControl+Shift+V',
  launchAtLogin: false,
  captureImages: true,
  captureFiles: true
}

export function getClipboardApi(): ClipboardApi | null {
  return window.clipboardApi ?? null
}

export async function listItems(): Promise<ClipboardItem[]> {
  const api = getClipboardApi()
  return api ? api.listItems() : []
}

export async function getSettings(): Promise<ClipboardSettings> {
  const api = getClipboardApi()
  return api ? api.getSettings() : fallbackSettings
}

export async function getAppVersion(): Promise<string> {
  const api = getClipboardApi()
  return api ? api.getAppVersion() : '0.1.0'
}

export async function getLogoUrl(): Promise<string | null> {
  const api = getClipboardApi()
  return api ? api.getLogoUrl() : null
}
