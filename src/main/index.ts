import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import type { ClipboardSettings } from '../shared/types'
import { ClipboardWatcher, writeItemToClipboard } from './clipboardWatcher'
import { SettingsStore } from './settings'
import { ClipboardRepository } from './storage'

app.setName('LasBoard')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let repository: ClipboardRepository
let settingsStore: SettingsStore
let watcher: ClipboardWatcher
let isQuitting = false

function createWindow(): void {
  const logoPath = resolveLogoPath()
  mainWindow = new BrowserWindow({
    width: 460,
    height: 620,
    minWidth: 380,
    minHeight: 500,
    show: true,
    frame: true,
    resizable: true,
    movable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    title: 'LasBoard',
    icon: logoPath,
    backgroundColor: '#171a21',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`LasBoard renderer failed to load: ${errorCode} ${errorDescription}`)
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resolveLogoPath()).resize({ width: 18, height: 18, quality: 'best' })
  tray = new Tray(icon)
  tray.setToolTip('LasBoard')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open LasBoard', click: toggleWindow },
      { type: 'separator' },
      {
        label: 'Quit LasBoard',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', toggleWindow)
}

function toggleWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  mainWindow.webContents.send('items:changed', watcher.captureNow())
}

function registerHotkey(): void {
  globalShortcut.unregisterAll()
  const hotkey = settingsStore.get().hotkey
  const registered = globalShortcut.register(hotkey, toggleWindow)
  if (!registered) {
    globalShortcut.register('CommandOrControl+Shift+V', toggleWindow)
  }
}

function registerIpc(): void {
  ipcMain.handle('items:list', () => repository.list())
  ipcMain.handle('items:copy', (_event, id: string) => {
    const item = repository.get(id)
    if (!item) return
    writeItemToClipboard(item)
    watcher.setLastSeenHash(item.contentHash)
    repository.markCopied(id)
    mainWindow?.webContents.send('items:changed', repository.list())
  })
  ipcMain.handle('items:delete', (_event, id: string) => {
    repository.delete(id)
    mainWindow?.webContents.send('items:changed', repository.list())
  })
  ipcMain.handle('items:clear', () => {
    repository.clear()
    mainWindow?.webContents.send('items:changed', repository.list())
  })
  ipcMain.handle('items:pin', (_event, id: string, pinned: boolean) => {
    repository.pin(id, pinned)
    mainWindow?.webContents.send('items:changed', repository.list())
  })
  ipcMain.handle('settings:get', () => settingsStore.get())
  ipcMain.handle('settings:update', (_event, patch: Partial<ClipboardSettings>) => {
    const next = settingsStore.update(patch)
    repository.trim(next.maxItems)
    registerHotkey()
    mainWindow?.webContents.send('items:changed', repository.list())
    return next
  })
  ipcMain.handle('app:logo-url', () => createLogoDataUrl())
  ipcMain.handle('window:hide', () => mainWindow?.hide())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local.lasboard')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  app.dock?.setIcon(nativeImage.createFromPath(resolveLogoPath()))

  settingsStore = new SettingsStore()
  repository = new ClipboardRepository()
  watcher = new ClipboardWatcher(
    repository,
    settingsStore,
    join(app.getPath('userData'), 'images'),
    getScreenshotDirectories()
  )
  watcher.onChange((items) => mainWindow?.webContents.send('items:changed', items))

  createWindow()
  createTray()
  registerIpc()
  registerHotkey()
  watcher.start()
  mainWindow?.webContents.once('did-finish-load', () => {
    mainWindow?.webContents.send('items:changed', watcher.captureNow())
  })
})

app.on('will-quit', () => {
  isQuitting = true
  globalShortcut.unregisterAll()
  watcher?.stop()
})

app.on('window-all-closed', () => {
  // Keep the clipboard watcher alive after the window is closed.
})

function resolveLogoPath(): string {
  const candidates = [join(app.getAppPath(), 'logo-board.png'), join(process.cwd(), 'logo-board.png')]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function createLogoDataUrl(): string | null {
  const image = nativeImage.createFromPath(resolveLogoPath())
  if (image.isEmpty()) return null
  const png = image.resize({ width: 96, height: 96, quality: 'best' }).toPNG()
  return `data:image/png;base64,${png.toString('base64')}`
}

function getScreenshotDirectories(): string[] {
  const dirs = new Set<string>([app.getPath('desktop')])
  try {
    const configured = execFileSync('defaults', ['read', 'com.apple.screencapture', 'location'], {
      encoding: 'utf8'
    }).trim()
    if (configured) dirs.add(configured.replace(/^~(?=$|\/)/, app.getPath('home')))
  } catch {
    // macOS defaults to Desktop when no custom screenshot location is configured.
  }
  return Array.from(dirs)
}
