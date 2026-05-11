import { describe, expect, it } from 'vitest'
import {
  clampHistoryLimit,
  hashContent,
  isLikelyUrl,
  previewForText,
  titleForFiles,
  titleForText
} from './clipboardItem'

describe('clipboard item helpers', () => {
  it('creates stable hashes and separates types', () => {
    expect(hashContent('text', 'hello')).toBe(hashContent('text', 'hello'))
    expect(hashContent('text', 'hello')).not.toBe(hashContent('url', 'hello'))
  })

  it('detects http and https urls only', () => {
    expect(isLikelyUrl('https://example.com/a')).toBe(true)
    expect(isLikelyUrl('http://example.com')).toBe(true)
    expect(isLikelyUrl('ftp://example.com')).toBe(false)
    expect(isLikelyUrl('hello world')).toBe(false)
  })

  it('builds readable text titles and previews', () => {
    expect(titleForText('First line\nSecond line')).toBe('First line')
    expect(previewForText('First   line\nSecond line')).toBe('First line Second line')
  })

  it('labels single and multiple files', () => {
    expect(titleForFiles(['/tmp/report.pdf'])).toBe('report.pdf')
    expect(titleForFiles(['/tmp/a.txt', '/tmp/b.txt'])).toBe('2 files')
  })

  it('clamps history limit', () => {
    expect(clampHistoryLimit(2)).toBe(10)
    expect(clampHistoryLimit(1000)).toBe(500)
    expect(clampHistoryLimit(88.8)).toBe(89)
  })
})
