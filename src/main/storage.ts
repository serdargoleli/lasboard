import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipboardItem, NewClipboardItem } from '../shared/types'

type ClipboardItemRow = Omit<ClipboardItem, 'filePaths' | 'pinned' | 'thumbnailDataUrl'> & {
  filePathsJson: string | null
  pinned: 0 | 1
}

export class ClipboardRepository {
  private readonly db: Database.Database

  constructor() {
    const dataDir = app.getPath('userData')
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'clipboard.sqlite'))
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        preview TEXT NOT NULL,
        contentHash TEXT NOT NULL UNIQUE,
        textContent TEXT,
        filePathsJson TEXT,
        imagePath TEXT,
        thumbnailPath TEXT,
        imageKind TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        lastCopiedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_clipboard_order
        ON clipboard_items (pinned DESC, lastCopiedAt DESC);
    `)
    this.ensureColumn('imageKind', 'TEXT')
  }

  list(): ClipboardItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM clipboard_items
         ORDER BY pinned DESC, lastCopiedAt DESC`
      )
      .all() as ClipboardItemRow[]
    return rows.map(rowToItem)
  }

  get(id: string): ClipboardItem | null {
    const row = this.db.prepare('SELECT * FROM clipboard_items WHERE id = ?').get(id) as ClipboardItemRow | undefined
    return row ? rowToItem(row) : null
  }

  upsert(item: NewClipboardItem, maxItems: number): ClipboardItem {
    const now = Date.now()
    const existing = this.db
      .prepare('SELECT * FROM clipboard_items WHERE contentHash = ?')
      .get(item.contentHash) as ClipboardItemRow | undefined

    if (existing) {
      this.db
        .prepare(
          `UPDATE clipboard_items
           SET title = ?, preview = ?, textContent = ?, filePathsJson = ?,
               imagePath = ?, thumbnailPath = ?, imageKind = ?, lastCopiedAt = ?
           WHERE id = ?`
        )
        .run(
          item.title,
          item.preview,
          item.textContent,
          JSON.stringify(item.filePaths),
          item.imagePath,
          item.thumbnailPath,
          item.imageKind,
          now,
          existing.id
        )
      this.trim(maxItems)
      return this.get(existing.id)!
    }

    const created: ClipboardItem = {
      ...item,
      id: crypto.randomUUID(),
      pinned: false,
      createdAt: now,
      lastCopiedAt: now
    }

    this.db
      .prepare(
        `INSERT INTO clipboard_items
         (id, type, title, preview, contentHash, textContent, filePathsJson, imagePath,
          thumbnailPath, imageKind, pinned, createdAt, lastCopiedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        created.id,
        created.type,
        created.title,
        created.preview,
        created.contentHash,
        created.textContent,
        JSON.stringify(created.filePaths),
        created.imagePath,
        created.thumbnailPath,
        created.imageKind,
        created.pinned ? 1 : 0,
        created.createdAt,
        created.lastCopiedAt
      )

    this.trim(maxItems)
    return created
  }

  markCopied(id: string): void {
    this.db.prepare('UPDATE clipboard_items SET lastCopiedAt = ? WHERE id = ?').run(Date.now(), id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM clipboard_items WHERE id = ?').run(id)
  }

  clear(): void {
    this.db.prepare('DELETE FROM clipboard_items WHERE pinned = 0').run()
  }

  pin(id: string, pinned: boolean): void {
    this.db.prepare('UPDATE clipboard_items SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
  }

  trim(maxItems: number): void {
    this.db
      .prepare(
        `DELETE FROM clipboard_items
         WHERE pinned = 0
           AND id NOT IN (
             SELECT id FROM clipboard_items
             WHERE pinned = 0
             ORDER BY lastCopiedAt DESC
             LIMIT ?
           )`
      )
      .run(maxItems)
  }

  private ensureColumn(name: string, definition: string): void {
    const columns = this.db.prepare('PRAGMA table_info(clipboard_items)').all() as Array<{ name: string }>
    if (columns.some((column) => column.name === name)) return
    this.db.exec(`ALTER TABLE clipboard_items ADD COLUMN ${name} ${definition}`)
  }
}

function rowToItem(row: ClipboardItemRow): ClipboardItem {
  return {
    ...row,
    filePaths: row.filePathsJson ? (JSON.parse(row.filePathsJson) as string[]) : [],
    thumbnailDataUrl: readThumbnailDataUrl(row.thumbnailPath),
    imageKind: inferImageKind(row),
    pinned: row.pinned === 1
  }
}

function inferImageKind(row: ClipboardItemRow): ClipboardItem['imageKind'] {
  if (row.type !== 'image') return null
  if (row.imageKind === 'image' || row.imageKind === 'screenshot') return row.imageKind
  return row.title.toLowerCase().includes('screenshot') ? 'screenshot' : 'image'
}

function readThumbnailDataUrl(thumbnailPath: string | null): string | null {
  if (!thumbnailPath || !existsSync(thumbnailPath)) return null
  const png = readFileSync(thumbnailPath)
  return `data:image/png;base64,${png.toString('base64')}`
}
