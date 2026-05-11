export type ClipboardItemType = 'text' | 'url' | 'file' | 'image'
export type ClipboardImageKind = 'image' | 'screenshot'

export interface ClipboardItem {
  id: string
  type: ClipboardItemType
  title: string
  preview: string
  contentHash: string
  textContent: string | null
  filePaths: string[]
  imagePath: string | null
  thumbnailPath: string | null
  thumbnailDataUrl: string | null
  imageKind: ClipboardImageKind | null
  pinned: boolean
  createdAt: number
  lastCopiedAt: number
}

export interface ClipboardSettings {
  maxItems: number
  hotkey: string
  launchAtLogin: boolean
  captureImages: boolean
  captureFiles: boolean
}

export type NewClipboardItem = Omit<ClipboardItem, 'id' | 'createdAt' | 'lastCopiedAt' | 'pinned'>

export interface ClipboardApi {
  listItems: () => Promise<ClipboardItem[]>
  copyItem: (id: string) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
  pinItem: (id: string, pinned: boolean) => Promise<void>
  getSettings: () => Promise<ClipboardSettings>
  updateSettings: (settings: Partial<ClipboardSettings>) => Promise<ClipboardSettings>
  getAppVersion: () => Promise<string>
  getLogoUrl: () => Promise<string | null>
  hideWindow: () => Promise<void>
  onItemsChanged: (callback: (items: ClipboardItem[]) => void) => () => void
}
