import { clipboard, nativeImage } from 'electron'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  hashContent,
  isLikelyUrl,
  normalizeText,
  previewForFiles,
  previewForText,
  titleForFiles,
  titleForText,
  titleForUrl
} from '../shared/clipboardItem'
import type { ClipboardItem, NewClipboardItem } from '../shared/types'
import type { ClipboardRepository } from './storage'
import type { SettingsStore } from './settings'

type ChangeListener = (items: ClipboardItem[]) => void

export class ClipboardWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastSeenHash: string | null = null
  private lastImageProbeAt = 0
  private readonly listeners = new Set<ChangeListener>()
  private readonly screenshotWatchers: FSWatcher[] = []
  private readonly pendingScreenshotFiles = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly repository: ClipboardRepository,
    private readonly settings: SettingsStore,
    private readonly imageDir: string,
    private readonly screenshotDirs: string[] = []
  ) {
    mkdirSync(this.imageDir, { recursive: true })
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.captureCurrentClipboard(), 750)
    this.captureCurrentClipboard()
    this.startScreenshotWatchers()
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
    for (const watcher of this.screenshotWatchers) watcher.close()
    this.screenshotWatchers.length = 0
    for (const timer of this.pendingScreenshotFiles.values()) clearTimeout(timer)
    this.pendingScreenshotFiles.clear()
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setLastSeenHash(hash: string): void {
    this.lastSeenHash = hash
  }

  captureNow(): ClipboardItem[] {
    this.captureCurrentClipboard()
    return this.repository.list()
  }

  private captureCurrentClipboard(): void {
    const item = this.readClipboard()
    if (!item || item.contentHash === this.lastSeenHash) return

    this.lastSeenHash = item.contentHash
    this.repository.upsert(item, this.settings.get().maxItems)
    this.emit()
  }

  private emit(): void {
    const items = this.repository.list()
    for (const listener of this.listeners) listener(items)
  }

  private readClipboard(): NewClipboardItem | null {
    const settings = this.settings.get()
    const formats = clipboard.availableFormats()

    if (settings.captureImages || settings.captureFiles) {
      const filePaths = readClipboardFilePaths(formats)
      if (filePaths.length > 0) {
        const firstImagePath = settings.captureImages ? filePaths.find(isPreviewableImageFile) : undefined
        if (firstImagePath) {
          const imageItem = this.readImageFileClipboardItem(firstImagePath)
          if (imageItem) return imageItem
        }
        if (settings.captureFiles) return this.createFileClipboardItem(filePaths)
      }
    }

    if (settings.captureImages && hasImageFormat(formats) && this.shouldProbeImage()) {
      const imageItem = this.readImageClipboardItem(formats)
      if (imageItem) return imageItem
    }

    const text = normalizeText(clipboard.readText())
    if (text) {
      if (settings.captureImages || settings.captureFiles) {
        const textFilePaths = filePathsFromText(text)
        if (textFilePaths.length > 0) {
          const firstImagePath = settings.captureImages ? textFilePaths.find(isPreviewableImageFile) : undefined
          if (firstImagePath) {
            const imageItem = this.readImageFileClipboardItem(firstImagePath)
            if (imageItem) return imageItem
          }
          if (settings.captureFiles) return this.createFileClipboardItem(textFilePaths)
        }
      }

      const type = isLikelyUrl(text) ? 'url' : 'text'
      return {
        type,
        title: type === 'url' ? titleForUrl(text) : titleForText(text),
        preview: type === 'url' ? text : previewForText(text),
        contentHash: hashContent(type, text),
        textContent: text,
        filePaths: [],
        imagePath: null,
        thumbnailPath: null,
        thumbnailDataUrl: null,
        imageKind: null
      }
    }

    if (settings.captureImages && this.shouldProbeImage()) {
      return this.readImageClipboardItem(formats)
    }

    return null
  }

  private createFileClipboardItem(filePaths: string[]): NewClipboardItem {
    const payload = filePaths.join('\n')
    const contentHash = hashContent('file', payload)
    const thumbnailPath = this.createFileThumbnail(filePaths[0], contentHash)
    return {
      type: 'file',
      title: titleForFiles(filePaths),
      preview: previewForFiles(filePaths),
      contentHash,
      textContent: null,
      filePaths,
      imagePath: null,
      thumbnailPath,
      thumbnailDataUrl: null,
      imageKind: null
    }
  }

  private shouldProbeImage(): boolean {
    const now = Date.now()
    if (now - this.lastImageProbeAt < 2500) return false
    this.lastImageProbeAt = now
    return true
  }

  private readImageClipboardItem(formats: string[]): NewClipboardItem | null {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null

    const imageKind = detectImageKind(formats)
    const png = image.toPNG()
    const hash = hashContent('image', png.toString('base64'))
    const imagePath = join(this.imageDir, `${hash}.png`)
    const thumbnailPath = join(this.imageDir, `${hash}-thumb.png`)
    if (!existsSync(imagePath)) writeFileSync(imagePath, png)
    if (!existsSync(thumbnailPath)) {
      const thumbnail = nativeImage.createFromBuffer(png).resize({ width: 96, height: 96, quality: 'best' })
      writeFileSync(thumbnailPath, thumbnail.toPNG())
    }
    const size = image.getSize()
    return {
      type: 'image',
      title: imageKind === 'screenshot' ? 'Screenshot' : 'Image',
      preview: `${size.width} x ${size.height}`,
      contentHash: hash,
      textContent: null,
      filePaths: [],
      imagePath,
      thumbnailPath,
      thumbnailDataUrl: null,
      imageKind
    }
  }

  private readImageFileClipboardItem(filePath: string): NewClipboardItem | null {
    if (!existsSync(filePath) || !isPreviewableImageFile(filePath)) return null

    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return null

    const png = image.toPNG()
    const hash = hashContent('image', png.toString('base64'))
    const imagePath = join(this.imageDir, `${hash}.png`)
    const thumbnailPath = join(this.imageDir, `${hash}-thumb.png`)
    if (!existsSync(imagePath)) writeFileSync(imagePath, png)
    if (!existsSync(thumbnailPath)) {
      const thumbnail = image.resize({ width: 96, height: 96, quality: 'best' })
      writeFileSync(thumbnailPath, thumbnail.toPNG())
    }

    const size = image.getSize()
    return {
      type: 'image',
      title: basename(filePath),
      preview: `${size.width} x ${size.height}`,
      contentHash: hash,
      textContent: null,
      filePaths: [filePath],
      imagePath,
      thumbnailPath,
      thumbnailDataUrl: null,
      imageKind: 'image'
    }
  }

  private startScreenshotWatchers(): void {
    for (const dir of this.screenshotDirs) {
      if (!existsSync(dir)) continue
      const watcher = watch(dir, (_eventType, filename) => {
        if (!filename) return
        const filePath = join(dir, filename.toString())
        if (!isScreenshotFile(filePath)) return
        this.queueScreenshotFile(filePath, 650, 0)
      })
      this.screenshotWatchers.push(watcher)
    }
  }

  private queueScreenshotFile(filePath: string, delayMs: number, attempt: number): void {
    const existing = this.pendingScreenshotFiles.get(filePath)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.pendingScreenshotFiles.delete(filePath)
      this.captureScreenshotFile(filePath, attempt)
    }, delayMs)
    this.pendingScreenshotFiles.set(filePath, timer)
  }

  private captureScreenshotFile(filePath: string, attempt: number): void {
    const item = this.readScreenshotFileItem(filePath)
    if (!item && attempt < 5) {
      this.queueScreenshotFile(filePath, 650, attempt + 1)
      return
    }
    if (!item || item.contentHash === this.lastSeenHash) return

    this.lastSeenHash = item.contentHash
    if (item.imagePath && existsSync(item.imagePath)) {
      clipboard.writeImage(nativeImage.createFromPath(item.imagePath))
    }
    this.repository.upsert(item, this.settings.get().maxItems)
    this.emit()
  }

  private readScreenshotFileItem(filePath: string): NewClipboardItem | null {
    if (!existsSync(filePath) || !isPreviewableImageFile(filePath)) return null
    try {
      const stats = statSync(filePath)
      if (!stats.isFile() || stats.size === 0) return null
    } catch {
      return null
    }

    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return null

    const png = image.toPNG()
    const hash = hashContent('image', png.toString('base64'))
    const imagePath = join(this.imageDir, `${hash}.png`)
    const thumbnailPath = join(this.imageDir, `${hash}-thumb.png`)
    if (!existsSync(imagePath)) writeFileSync(imagePath, png)
    if (!existsSync(thumbnailPath)) {
      const thumbnail = image.resize({ width: 96, height: 96, quality: 'best' })
      writeFileSync(thumbnailPath, thumbnail.toPNG())
    }

    const size = image.getSize()
    return {
      type: 'image',
      title: 'Screenshot',
      preview: `${size.width} x ${size.height}`,
      contentHash: hash,
      textContent: null,
      filePaths: [],
      imagePath,
      thumbnailPath,
      thumbnailDataUrl: null,
      imageKind: 'screenshot'
    }
  }

  private createFileThumbnail(filePath: string, contentHash: string): string | null {
    if (!isPreviewableImageFile(filePath) || !existsSync(filePath)) return null
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return null

    const thumbnailPath = join(this.imageDir, `${contentHash}-file-thumb.png`)
    if (!existsSync(thumbnailPath)) {
      const thumbnail = image.resize({ width: 96, height: 96, quality: 'best' })
      writeFileSync(thumbnailPath, thumbnail.toPNG())
    }
    return thumbnailPath
  }
}

export function writeItemToClipboard(item: ClipboardItem): void {
  if (item.type === 'image' && item.imagePath && existsSync(item.imagePath)) {
    clipboard.writeImage(nativeImage.createFromPath(item.imagePath))
    return
  }

  if (item.type === 'file' && item.filePaths.length > 0) {
    const fileUrl = `file://${item.filePaths[0]}`
    clipboard.write({
      text: item.filePaths.join('\n'),
      bookmark: basename(item.filePaths[0])
    })
    clipboard.writeBuffer('public.file-url', Buffer.from(fileUrl))
    return
  }

  if (item.textContent) {
    clipboard.writeText(item.textContent)
  }
}

function readClipboardFilePaths(formats: string[]): string[] {
  const fileUrls = readFileUrls(formats)
  if (fileUrls.length > 0) return fileUrls

  const fileLikeFormats = formats.filter((format) => {
    const normalized = format.toLowerCase()
    return (
      normalized.includes('file') ||
      normalized.includes('filename') ||
      normalized.includes('furl') ||
      normalized.includes('url') ||
      normalized.includes('pasteboard')
    )
  })

  for (const format of fileLikeFormats) {
    const fromString = filePathsFromText(clipboard.read(format))
    if (fromString.length > 0) return fromString

    const buffer = clipboard.readBuffer(format)
    const fromBuffer = filePathsFromPasteboardBuffer(buffer)
    if (fromBuffer.length > 0) return fromBuffer

    const fromPlist = filePathsFromPlistBuffer(buffer)
    if (fromPlist.length > 0) return fromPlist
  }

  if (process.platform === 'darwin' && hasLikelyMacFileFormat(formats)) {
    const fromMacPasteboard = readMacPasteboardFilePaths()
    if (fromMacPasteboard.length > 0) return fromMacPasteboard
  }

  return []
}

function hasLikelyMacFileFormat(formats: string[]): boolean {
  return formats.some((format) => {
    const normalized = format.toLowerCase()
    return (
      normalized.includes('file') ||
      normalized.includes('filename') ||
      normalized.includes('furl') ||
      normalized.includes('finder') ||
      normalized.includes('pasteboard')
    )
  })
}

function readMacPasteboardFilePaths(): string[] {
  try {
    const script = [
      'ObjC.import("AppKit")',
      'const pb = $.NSPasteboard.generalPasteboard',
      'const items = pb.pasteboardItems',
      'if (items) {',
      '  for (let i = 0; i < items.count; i++) {',
      '    const item = items.objectAtIndex(i)',
      '    const types = item.types',
      '    for (let j = 0; j < types.count; j++) {',
      '      const value = item.stringForType(types.objectAtIndex(j))',
      '      if (value) console.log(ObjC.unwrap(value))',
      '    }',
      '  }',
      '}'
    ].join(';')
    const stdout = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return filePathsFromText(stdout)
  } catch {
    return []
  }
}

function readFileUrls(formats: string[]): string[] {
  const urlFormats = Array.from(
    new Set([
      'public.file-url',
      'public.url',
      'text/uri-list',
      ...formats.filter((format) => format.toLowerCase().includes('file-url'))
    ])
  )
  for (const format of urlFormats) {
    if (!formats.includes(format)) continue
    const text = [clipboard.read(format), clipboard.readBuffer(format).toString('utf8')]
      .map((value) => value.trim())
      .find((value) => value.startsWith('file://'))
    if (!text) continue
    const paths = filePathsFromText(text)
    if (paths.length > 0) return paths
  }
  return []
}

function filePathsFromPasteboardBuffer(buffer: Buffer): string[] {
  if (buffer.length === 0) return []
  const candidates = [
    buffer.toString('utf8'),
    decodeUtf16Be(buffer).replace(/\0/g, ''),
    buffer.toString('utf16le').replace(/\0/g, ''),
    buffer.toString('latin1')
  ]
  return Array.from(new Set(candidates.flatMap(filePathsFromText)))
}

function decodeUtf16Be(buffer: Buffer): string {
  const swapped = Buffer.alloc(buffer.length - (buffer.length % 2))
  for (let index = 0; index < swapped.length; index += 2) {
    swapped[index] = buffer[index + 1]
    swapped[index + 1] = buffer[index]
  }
  return swapped.toString('utf16le')
}

function filePathsFromPlistBuffer(buffer: Buffer): string[] {
  if (buffer.length === 0) return []

  const tempDir = mkdtempSync(join(tmpdir(), 'lasboard-pasteboard-'))
  const plistPath = join(tempDir, 'pasteboard-data')
  try {
    writeFileSync(plistPath, buffer)
    const json = execFileSync('plutil', ['-convert', 'json', '-o', '-', plistPath], {
      encoding: 'utf8',
      timeout: 1000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return filePathsFromPlistValue(JSON.parse(json))
  } catch {
    return []
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function filePathsFromPlistValue(value: unknown): string[] {
  if (typeof value === 'string') return filePathsFromText(value)
  if (Array.isArray(value)) return Array.from(new Set(value.flatMap(filePathsFromPlistValue)))
  if (!value || typeof value !== 'object') return []
  return Array.from(new Set(Object.values(value).flatMap(filePathsFromPlistValue)))
}

function filePathsFromText(text: string): string[] {
  const paths = text
    .split(/[\r\n]+/)
    .flatMap((line) => extractFilePathCandidates(line))
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('file://')) return fileUrlToPath(line)
      return line
    })
    .filter((line) => line.startsWith('/') && existsSync(line))

  return Array.from(new Set(paths))
}

function fileUrlToPath(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return value
    return decodeURIComponent(url.pathname)
  } catch {
    return decodeURIComponent(value.replace(/^file:\/\/(?:localhost)?/, ''))
  }
}

function extractFilePathCandidates(value: string): string[] {
  const normalized = value.replace(/\0/g, '').trim()
  if (!normalized) return []

  const candidates = [normalized]
  const fileUrlMatches = normalized.match(/file:\/\/[^\s<>"')]+/g) ?? []
  candidates.push(...fileUrlMatches)

  const pathMatches = normalized.match(/\/Users\/[^<>"\r\n]+|\/Volumes\/[^<>"\r\n]+|\/private\/[^<>"\r\n]+|\/tmp\/[^<>"\r\n]+/g) ?? []
  candidates.push(...pathMatches)

  return candidates
}

function hasImageFormat(formats: string[]): boolean {
  return formats.some((format) => {
    const normalized = format.toLowerCase()
    return (
      normalized.includes('png') ||
      normalized.includes('jpg') ||
      normalized.includes('jpeg') ||
      normalized.includes('gif') ||
      normalized.includes('webp') ||
      normalized.includes('heic') ||
      normalized.includes('tif') ||
      normalized.includes('tiff') ||
      normalized.includes('image')
    )
  })
}

function detectImageKind(formats: string[]): 'image' | 'screenshot' {
  const normalizedFormats = formats.map((format) => format.toLowerCase())
  const hasScreenshotMarker = normalizedFormats.some((format) => format.includes('screenshot'))
  if (hasScreenshotMarker) return 'screenshot'

  return 'image'
}

function isPreviewableImageFile(filePath: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.heic'].includes(extname(filePath).toLowerCase())
}

function isScreenshotFile(filePath: string): boolean {
  if (!isPreviewableImageFile(filePath)) return false
  const fileName = basename(filePath).toLowerCase()
  return (
    fileName.startsWith('screenshot') ||
    fileName.startsWith('screen shot') ||
    fileName.startsWith('ekran resmi') ||
    fileName.startsWith('ekran görüntüsü') ||
    fileName.startsWith('ekran goruntusu')
  )
}
