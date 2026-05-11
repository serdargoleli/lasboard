import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { clampHistoryLimit } from '../shared/clipboardItem'
import type { ClipboardSettings } from '../shared/types'

const DEFAULT_SETTINGS: ClipboardSettings = {
  maxItems: 100,
  hotkey: 'CommandOrControl+Shift+V',
  launchAtLogin: false,
  captureImages: true,
  captureFiles: true
}

export class SettingsStore {
  private readonly filePath: string
  private current: ClipboardSettings

  constructor() {
    this.filePath = join(app.getPath('userData'), 'settings.json')
    this.current = this.read()
  }

  get(): ClipboardSettings {
    return { ...this.current }
  }

  update(settings: Partial<ClipboardSettings>): ClipboardSettings {
    this.current = {
      ...this.current,
      ...settings,
      maxItems: settings.maxItems === undefined ? this.current.maxItems : clampHistoryLimit(settings.maxItems)
    }
    this.write()
    app.setLoginItemSettings({ openAtLogin: this.current.launchAtLogin })
    return this.get()
  }

  private read(): ClipboardSettings {
    if (!existsSync(this.filePath)) return DEFAULT_SETTINGS

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ClipboardSettings>
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        maxItems: clampHistoryLimit(parsed.maxItems ?? DEFAULT_SETTINGS.maxItems)
      }
    } catch {
      return DEFAULT_SETTINGS
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.current, null, 2))
  }
}
