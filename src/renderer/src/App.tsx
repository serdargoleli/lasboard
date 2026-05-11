import { useEffect, useMemo, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Clipboard,
  Copy,
  File,
  Image,
  Link,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  RefreshCw,
  Trash,
  X
} from 'lucide-react'
import type { ClipboardItem, ClipboardSettings } from '@shared/types'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu'
import { Input } from './components/ui/input'
import { ScrollArea } from './components/ui/scroll-area'
import { Switch } from './components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { getClipboardApi, getLogoUrl, getSettings, listItems } from './api'
import { cn } from './lib/utils'

const typeLabels: Record<ClipboardItem['type'], string> = {
  text: 'Text',
  url: 'Link',
  file: 'File',
  image: 'Image'
}

const imageKindLabels = {
  image: 'Image',
  screenshot: 'Screenshot'
} as const

const typeIcons = {
  text: Clipboard,
  url: Link,
  file: File,
  image: Image
}

type ClipboardTab = 'all' | 'text' | 'url' | 'image' | 'screenshot'

const tabs: Array<{ value: ClipboardTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'text', label: 'Text' },
  { value: 'url', label: 'Link' },
  { value: 'image', label: 'Image' },
  { value: 'screenshot', label: 'Screenshots' }
]

export function App(): JSX.Element {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [settings, setSettings] = useState<ClipboardSettings | null>(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<ClipboardTab>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(() =>
    getClipboardApi() ? null : 'LasBoard desktop bridge is not loaded. Restart with npm run dev.'
  )

  useEffect(() => {
    const api = getClipboardApi()
    if (!api) {
      return
    }

    listItems().then(setItems).catch((reason) => setError(String(reason)))
    getSettings().then(setSettings).catch((reason) => setError(String(reason)))
    getLogoUrl().then(setLogoUrl).catch((reason) => setError(String(reason)))
    const unsubscribe = api.onItemsChanged(setItems)
    return () => {
      unsubscribe()
    }
  }, [])

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      if (!matchesTab(item, activeTab)) return false
      if (!needle) return true
      return [item.title, item.preview, item.textContent ?? '', item.filePaths.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [activeTab, items, query])
  const activeIndex = Math.min(selectedIndex, Math.max(filteredItems.length - 1, 0))

  useEffect(() => {
    if (!toast) return
    const toastTimer = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(toastTimer)
  }, [toast])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        getClipboardApi()?.hideWindow()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((index) => Math.min(index + 1, Math.max(filteredItems.length - 1, 0)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((index) => Math.max(index - 1, 0))
      }
      if (event.key === 'Enter') {
        const selected = filteredItems[activeIndex]
        if (selected) void copyItem(selected.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, filteredItems])

  async function updateSettings(patch: Partial<ClipboardSettings>): Promise<void> {
    const api = getClipboardApi()
    if (!api) return
    const next = await api.updateSettings(patch)
    setSettings(next)
  }

  async function copyItem(id: string): Promise<void> {
    const api = getClipboardApi()
    if (!api) return
    await api.copyItem(id)
    setToast('Kopyalandı')
  }

  return (
    <TooltipProvider delayDuration={250}>
      <main className="flex h-screen flex-col bg-background text-foreground">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-popover">
            {logoUrl ? (
              <img className="h-full w-full object-cover" src={logoUrl} alt="LasBoard" />
            ) : (
              <Clipboard className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8 pr-8"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedIndex(0)
              }}
              placeholder="Search clipboard"
            />
            {query ? (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Refresh clipboard"
                onClick={() => listItems().then(setItems).catch((reason) => setError(String(reason)))}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          <SettingsDialog settings={settings} updateSettings={updateSettings} />
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={cn(
                'h-8 shrink-0 cursor-pointer rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                activeTab === tab.value && 'bg-muted text-foreground'
              )}
              onClick={() => {
                setActiveTab(tab.value)
                setSelectedIndex(0)
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <ScrollArea className="min-h-0 flex-1">
          {error ? (
            <ErrorState message={error} />
          ) : filteredItems.length === 0 ? (
            <EmptyState hasQuery={query.length > 0} />
          ) : (
            <div className="p-2">
              {filteredItems.map((item, index) => (
                <ClipboardRow
                  key={item.id}
                  item={item}
                  selected={index === activeIndex}
                  onCopy={() => copyItem(item.id)}
                  onDelete={() => getClipboardApi()?.deleteItem(item.id)}
                  onPin={() => getClipboardApi()?.pinItem(item.id, !item.pinned)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <footer className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            {filteredItems.length} shown / {items.length} saved
          </span>
          <span>Cmd+Shift+V</span>
        </footer>
        {toast ? (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-lg">
            {toast}
          </div>
        ) : null}
      </main>
    </TooltipProvider>
  )
}

function ClipboardRow({
  item,
  selected,
  onCopy,
  onDelete,
  onPin
}: {
  item: ClipboardItem
  selected: boolean
  onCopy: () => void
  onDelete: () => void
  onPin: () => void
}): JSX.Element {
  const Icon = typeIcons[item.type]
  const thumbnail = item.thumbnailDataUrl

  function onRowKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onCopy()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group mb-1 grid w-full cursor-pointer grid-cols-[40px_1fr_auto_auto] items-center gap-2 rounded-md border border-transparent p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-border bg-muted' : 'hover:bg-muted/70'
      )}
      onClick={onCopy}
      onKeyDown={onRowKeyDown}
    >
      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border bg-popover">
        {thumbnail ? (
          <img className="h-full w-full object-cover" src={thumbnail} alt="" />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {item.pinned ? <Pin className="h-3 w-3 shrink-0 fill-current text-primary" /> : null}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <Badge>{item.type === 'image' && item.imageKind ? imageKindLabels[item.imageKind] : typeLabels[item.type]}</Badge>
          <span className="truncate text-xs text-muted-foreground">{item.preview}</span>
        </div>
        {item.type === 'file' ? (
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={item.filePaths.join('\n')}>
            {item.filePaths[0]}
          </div>
        ) : null}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="cursor-pointer"
            size="icon"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onCopy()
            }}
            aria-label="Copy item"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                className="cursor-pointer opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                size="icon"
                variant="ghost"
                onClick={(event) => event.stopPropagation()}
                aria-label="Item actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(event) => {
              event.stopPropagation()
              onPin()
            }}
          >
            {item.pinned ? 'Unpin' : 'Pin'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SettingsDialog({
  settings,
  updateSettings
}: {
  settings: ClipboardSettings | null
  updateSettings: (patch: Partial<ClipboardSettings>) => Promise<void>
}): JSX.Element {
  return (
    <Dialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Open settings">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      <DialogContent>
        <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          Configure local clipboard capture.
        </DialogDescription>

        {settings ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">History limit</span>
              <Input
                className="mt-1"
                type="number"
                min={10}
                max={500}
                value={settings.maxItems}
                onChange={(event) => updateSettings({ maxItems: Number(event.target.value) })}
              />
            </label>
            <SettingsSwitch
              label="Launch at login"
              checked={settings.launchAtLogin}
              onCheckedChange={(launchAtLogin) => updateSettings({ launchAtLogin })}
            />
            <SettingsSwitch
              label="Capture screenshots and images"
              checked={settings.captureImages}
              onCheckedChange={(captureImages) => updateSettings({ captureImages })}
            />
            <SettingsSwitch
              label="Capture copied files"
              checked={settings.captureFiles}
              onCheckedChange={(captureFiles) => updateSettings({ captureFiles })}
            />
            <div className="flex justify-end border-t border-border pt-3">
              <Button variant="destructive" size="sm" onClick={() => getClipboardApi()?.clearHistory()}>
                <Trash className="mr-2 h-4 w-4" />
                Clear unpinned
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SettingsSwitch({
  label,
  checked,
  onCheckedChange
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}

function EmptyState({ hasQuery }: { hasQuery: boolean }): JSX.Element {
  return (
    <div className="flex h-[420px] flex-col items-center justify-center px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-popover">
        <Clipboard className="h-5 w-5 text-muted-foreground" />
      </div>
      <h1 className="mt-4 text-sm font-semibold">{hasQuery ? 'No matches' : 'Clipboard is empty'}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasQuery ? 'Try a different search.' : 'Copied text, links, files, and screenshots will appear here.'}
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex h-[420px] flex-col items-center justify-center px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10">
        <X className="h-5 w-5 text-destructive" />
      </div>
      <h1 className="mt-4 text-sm font-semibold">LasBoard could not start</h1>
      <p className="mt-1 max-w-[300px] text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function matchesTab(item: ClipboardItem, tab: ClipboardTab): boolean {
  if (tab === 'all') return true
  if (tab === 'screenshot') return item.type === 'image' && item.imageKind === 'screenshot'
  if (tab === 'image') return item.type === 'image' && item.imageKind !== 'screenshot'
  return item.type === tab
}
