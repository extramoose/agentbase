'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus,
  Trash2,
  Star,
  Flag,
  Utensils,
  FileText,
  Lightbulb,
  Newspaper,
  LayoutGrid,
  List,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { EditShelf } from '@/components/edit-shelf'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/rich-text-editor'
import { UnfurlInput } from '@/components/unfurl-input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { stripMarkdown } from '@/lib/strip-markdown'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemType = 'favorite' | 'flag' | 'restaurant' | 'note' | 'idea' | 'article'

type LibraryItem = {
  id: string
  type: ItemType
  title: string
  url: string | null
  source: string | null
  excerpt: string | null
  body: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  tags: string[]
  is_public: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<ItemType, { label: string; icon: React.ElementType; color: string }> = {
  favorite:   { label: 'Favorite',   icon: Star,      color: 'text-yellow-400' },
  flag:       { label: 'Flag',       icon: Flag,      color: 'text-red-400' },
  restaurant: { label: 'Restaurant', icon: Utensils,  color: 'text-orange-400' },
  note:       { label: 'Note',       icon: FileText,  color: 'text-blue-400' },
  idea:       { label: 'Idea',       icon: Lightbulb, color: 'text-purple-400' },
  article:    { label: 'Article',    icon: Newspaper, color: 'text-green-400' },
}

const ALL_TYPES = Object.keys(TYPE_CONFIG) as ItemType[]

function domainFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryClient({ initialItems, initialItemId }: { initialItems: LibraryItem[]; initialItemId?: string }) {
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router })
  const searchParams = useSearchParams()

  const [items, setItems] = useState<LibraryItem[]>(initialItems)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('library-view') as 'card' | 'list') ?? 'card'
    }
    return 'card'
  })
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const supabase = createClient()
  const initialHandled = useRef(false)

  // Build query string from current search state
  const buildQs = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [search])

  // Sync search state → URL query params (skip initial render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    routerRef.current.replace(`${window.location.pathname}${buildQs()}`, { scroll: false })
  }, [buildQs])

  // Open shelf for initialItemId after data is available
  useEffect(() => {
    if (!initialItemId || initialHandled.current || items.length === 0) return
    initialHandled.current = true
    const item = items.find(i => i.id === initialItemId)
    if (item) setSelectedItem(item)
  }, [items, initialItemId])

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('library-view', viewMode)
  }, [viewMode])

  // ===== Realtime subscription =====
  useEffect(() => {
    const channel = supabase
      .channel('library_items:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'library_items' },
        (payload) => {
          const newItem = payload.new as LibraryItem
          setItems((prev) => {
            if (prev.some((i) => i.id === newItem.id)) return prev
            return [newItem, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'library_items' },
        (payload) => {
          const updated = payload.new as LibraryItem
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          setSelectedItem((prev) => (prev?.id === updated.id ? updated : prev))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'library_items' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setItems((prev) => prev.filter((i) => i.id !== deletedId))
          setSelectedItem((prev) => (prev?.id === deletedId ? null : prev))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // ===== Filtered items =====
  const filtered = useMemo(() => {
    let result = items
    if (typeFilter !== 'all') {
      result = result.filter((i) => i.type === typeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.excerpt?.toLowerCase().includes(q) ||
          i.body?.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q)) ||
          i.location_name?.toLowerCase().includes(q) ||
          i.source?.toLowerCase().includes(q)
      )
    }
    return result
  }, [items, typeFilter, search])

  // ===== Type counts =====
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of ALL_TYPES) counts[t] = 0
    for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1
    return counts
  }, [items])

  // ===== CRUD =====
  const createItem = useCallback(
    async (fields: Omit<LibraryItem, 'id' | 'created_at' | 'updated_at'>) => {
      const tempId = `temp-${Date.now()}`
      const optimistic: LibraryItem = {
        ...fields,
        id: tempId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setItems((prev) => [optimistic, ...prev])
      setIsCreating(false)

      try {
        const res = await fetch('/api/commands/create-library-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to create item')
        setItems((prev) => prev.map((i) => (i.id === tempId ? (json.data as LibraryItem) : i)))
        toast({ type: 'success', message: 'Item created' })
      } catch (err) {
        setItems((prev) => prev.filter((i) => i.id !== tempId))
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
      }
    },
    []
  )

  const updateItemField = useCallback(
    async (itemId: string, fields: Record<string, unknown>) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId ? { ...i, ...fields, updated_at: new Date().toISOString() } as LibraryItem : i
        )
      )
      setSelectedItem((prev) =>
        prev?.id === itemId
          ? { ...prev, ...fields, updated_at: new Date().toISOString() } as LibraryItem
          : prev
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'library_items', id: itemId, fields }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
      }
    },
    []
  )

  const deleteItem = useCallback(
    async (itemId: string) => {
      const prev = items
      setItems((i) => i.filter((x) => x.id !== itemId))
      setSelectedItem(null)

      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'library_items', id: itemId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        toast({ type: 'success', message: 'Item deleted' })
      } catch (err) {
        setItems(prev)
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      }
    },
    [items]
  )

  // ===== Render =====
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <Button onClick={() => setIsCreating(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      {/* Search + View toggle */}
      <SearchFilterBar search={search} onSearchChange={setSearch} placeholder="Search library...">
        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <button
            onClick={() => setViewMode('card')}
            className={cn(
              'p-1.5 rounded-sm transition-colors',
              viewMode === 'card' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded-sm transition-colors',
              viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </SearchFilterBar>

      {/* Type filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
            typeFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          All ({items.length})
        </button>
        {ALL_TYPES.map((t) => {
          const cfg = TYPE_CONFIG[t]
          const Icon = cfg.icon
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
                typeFilter === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}s ({typeCounts[t]})
            </button>
          )
        })}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {items.length === 0 ? 'No items yet. Click "+ Add Item" to get started.' : 'No items match your filters.'}
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onClick={() => { setSelectedItem(item); router.replace(`/tools/library/${item.id}${buildQs()}`, { scroll: false }) }} />
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {filtered.map((item, idx) => (
            <ItemRow key={item.id} item={item} isLast={idx === filtered.length - 1} onClick={() => { setSelectedItem(item); router.replace(`/tools/library/${item.id}${buildQs()}`, { scroll: false }) }} />
          ))}
        </div>
      )}

      {/* Edit shelf for existing item */}
      {selectedItem && (
        <LibraryEditShelf
          item={selectedItem}
          onClose={() => { setSelectedItem(null); router.replace(`/tools/library${buildQs()}`, { scroll: false }) }}
          onUpdate={updateItemField}
          onDelete={async (id) => { await deleteItem(id); router.replace(`/tools/library${buildQs()}`, { scroll: false }) }}
        />
      )}

      {/* Create shelf */}
      {isCreating && (
        <LibraryCreateShelf
          onClose={() => setIsCreating(false)}
          onCreate={createItem}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card view
// ---------------------------------------------------------------------------

function ItemCard({ item, onClick }: { item: LibraryItem; onClick: () => void }) {
  const cfg = TYPE_CONFIG[item.type]
  const Icon = cfg.icon
  const domain = domainFromUrl(item.url)
  const snippet = item.excerpt || stripMarkdown(item.body ?? '', 120)

  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg border border-border bg-card hover:border-muted-foreground/40 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
        <span className="font-medium truncate">{item.title}</span>
      </div>
      {snippet && (
        <p className="text-sm text-muted-foreground line-clamp-2">{snippet}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
        {domain && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {domain}
          </span>
        )}
        {item.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {new Date(item.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ItemRow({
  item,
  isLast,
  onClick,
}: {
  item: LibraryItem
  isLast: boolean
  onClick: () => void
}) {
  const cfg = TYPE_CONFIG[item.type]
  const Icon = cfg.icon
  const domain = domainFromUrl(item.url)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors',
        !isLast && 'border-b border-border'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
      <span className="font-medium truncate flex-1 min-w-0">{item.title}</span>
      <Badge variant="secondary" className="text-xs shrink-0">
        {cfg.label}
      </Badge>
      {domain && (
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
          {domain}
        </span>
      )}
      <div className="hidden md:flex items-center gap-1 shrink-0">
        {item.tags.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
        {new Date(item.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Edit shelf (existing item)
// ---------------------------------------------------------------------------

function LibraryEditShelf({
  item,
  onClose,
  onUpdate,
  onDelete,
}: {
  item: LibraryItem
  onClose: () => void
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(item.title)
  const [type, setType] = useState<ItemType>(item.type)
  const [url, setUrl] = useState(item.url ?? '')
  const [source, setSource] = useState(item.source ?? '')
  const [excerpt, setExcerpt] = useState(item.excerpt ?? '')
  const [body, setBody] = useState(item.body ?? '')
  const [locationName, setLocationName] = useState(item.location_name ?? '')
  const [latitude, setLatitude] = useState(item.latitude?.toString() ?? '')
  const [longitude, setLongitude] = useState(item.longitude?.toString() ?? '')
  const [tags, setTags] = useState<string[]>(item.tags)
  const [isPublic, setIsPublic] = useState(item.is_public)

  // Sync when item prop changes (from realtime)
  useEffect(() => {
    setTitle(item.title)
    setType(item.type)
    setUrl(item.url ?? '')
    setSource(item.source ?? '')
    setExcerpt(item.excerpt ?? '')
    setBody(item.body ?? '')
    setLocationName(item.location_name ?? '')
    setLatitude(item.latitude?.toString() ?? '')
    setLongitude(item.longitude?.toString() ?? '')
    setTags(item.tags)
    setIsPublic(item.is_public)
  }, [item])

  function saveFieldImmediate(fields: Record<string, unknown>) {
    onUpdate(item.id, fields)
  }

  const showUrl = type === 'favorite' || type === 'article' || type === 'flag' || type === 'restaurant'
  const showSource = type === 'article'
  const showExcerpt = type === 'article'
  const showBody = type === 'note' || type === 'idea'
  const showLocation = type === 'restaurant' || type === 'flag'
  const showCoords = type === 'restaurant'

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title={TYPE_CONFIG[item.type].label}
      entityType="library_items"
      entityId={item.id}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveFieldImmediate({ title: e.target.value })}
            className="text-base font-medium"
          />
        </div>

        {/* Type */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Type</label>
          <select
            value={type}
            onChange={(e) => {
              const val = e.target.value as ItemType
              setType(val)
              saveFieldImmediate({ type: val })
            }}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          >
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_CONFIG[t].label}
              </option>
            ))}
          </select>
        </div>

        {/* URL */}
        {showUrl && (
          <UnfurlInput
            label="URL"
            value={url}
            onChange={(v) => setUrl(v)}
            onBlur={(v) => saveFieldImmediate({ url: v || null })}
            placeholder="https://..."
          />
        )}

        {/* Source */}
        {showSource && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Source</label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ source: e.target.value || null })}
              placeholder="e.g. NY Times, Hacker News"
              className="text-sm"
            />
          </div>
        )}

        {/* Excerpt */}
        {showExcerpt && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Excerpt</label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ excerpt: e.target.value || null })}
              placeholder="Short description or teaser..."
              className="min-h-[80px] text-sm resize-y"
            />
          </div>
        )}

        {/* Body */}
        {showBody && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Body</label>
            <RichTextEditor
              value={body}
              onBlur={(md) => {
                setBody(md)
                saveFieldImmediate({ body: md || null })
              }}
              placeholder="Write your note or idea..."
              minHeight="120px"
            />
          </div>
        )}

        {/* Location name */}
        {showLocation && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Location</label>
            <Input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ location_name: e.target.value || null })}
              placeholder="Location name..."
              className="text-sm"
            />
          </div>
        )}

        {/* Coordinates */}
        {showCoords && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Latitude</label>
              <Input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                onBlur={(e) => saveFieldImmediate({ latitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="0.000000"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Longitude</label>
              <Input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                onBlur={(e) => saveFieldImmediate({ longitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="0.000000"
                className="text-sm"
              />
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
          <TagCombobox
            selected={tags}
            onChange={(newTags) => {
              setTags(newTags)
              saveFieldImmediate({ tags: newTags })
            }}
          />
        </div>

        {/* Is Public */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => {
              setIsPublic(e.target.checked)
              saveFieldImmediate({ is_public: e.target.checked })
            }}
            className="rounded border-input"
          />
          <span className="text-sm">Public</span>
        </label>
      </div>
    </EditShelf>
  )
}

// ---------------------------------------------------------------------------
// Create shelf (new item)
// ---------------------------------------------------------------------------

function LibraryCreateShelf({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (fields: Omit<LibraryItem, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
}) {
  const [type, setType] = useState<ItemType>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('library-last-type') as ItemType) ?? 'note'
    }
    return 'note'
  })
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [locationName, setLocationName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)

  const showUrl = type === 'favorite' || type === 'article' || type === 'flag' || type === 'restaurant'
  const showSource = type === 'article'
  const showExcerpt = type === 'article'
  const showBody = type === 'note' || type === 'idea'
  const showLocation = type === 'restaurant' || type === 'flag'
  const showCoords = type === 'restaurant'

  async function handleSave() {
    if (!title.trim()) {
      toast({ type: 'error', message: 'Title is required' })
      return
    }
    localStorage.setItem('library-last-type', type)
    await onCreate({
      type,
      title: title.trim(),
      url: url || null,
      source: source || null,
      excerpt: excerpt || null,
      body: body || null,
      location_name: locationName || null,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      tags,
      is_public: isPublic,
    })
  }

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title="New Item"
      headerRight={
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Type */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          >
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_CONFIG[t].label}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Item title..."
            className="text-base font-medium"
            autoFocus
          />
        </div>

        {/* URL */}
        {showUrl && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">URL</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="text-sm"
            />
          </div>
        )}

        {/* Source */}
        {showSource && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Source</label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. NY Times, Hacker News"
              className="text-sm"
            />
          </div>
        )}

        {/* Excerpt */}
        {showExcerpt && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Excerpt</label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short description or teaser..."
              className="min-h-[80px] text-sm resize-y"
            />
          </div>
        )}

        {/* Body */}
        {showBody && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Body</label>
            <RichTextEditor
              value={body}
              onChange={(md) => setBody(md)}
              placeholder="Write your note or idea..."
              minHeight="120px"
            />
          </div>
        )}

        {/* Location name */}
        {showLocation && (
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Location</label>
            <Input
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Location name..."
              className="text-sm"
            />
          </div>
        )}

        {/* Coordinates */}
        {showCoords && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Latitude</label>
              <Input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="0.000000"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Longitude</label>
              <Input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="0.000000"
                className="text-sm"
              />
            </div>
          </div>
        )}

        {/* Tags */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
          <TagCombobox
            selected={tags}
            onChange={setTags}
          />
        </div>

        {/* Is Public */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="rounded border-input"
          />
          <span className="text-sm">Public</span>
        </label>
      </div>
    </EditShelf>
  )
}
