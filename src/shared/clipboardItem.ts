import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { ClipboardItemType } from './types'

export function hashContent(type: ClipboardItemType, payload: string): string {
  return createHash('sha256').update(`${type}:${payload}`).digest('hex')
}

export function isLikelyUrl(value: string): boolean {
  const text = value.trim()
  if (!text || /\s/.test(text)) return false

  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

export function titleForText(value: string): string {
  const normalized = normalizeText(value)
  if (!normalized) return 'Empty text'
  return normalized.split('\n')[0].slice(0, 80)
}

export function previewForText(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ').slice(0, 180)
}

export function titleForUrl(value: string): string {
  try {
    return new URL(value.trim()).hostname.replace(/^www\./, '')
  } catch {
    return 'Link'
  }
}

export function titleForFiles(paths: string[]): string {
  if (paths.length === 1) return basename(paths[0])
  return `${paths.length} files`
}

export function previewForFiles(paths: string[]): string {
  return paths.join('\n')
}

export function clampHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(500, Math.max(10, Math.round(value)))
}
