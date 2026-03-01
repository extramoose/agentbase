'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Star,
  Flag,
  Utensils,
  FileText,
  Lightbulb,
  Newspaper,
  ExternalLink,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { EntityGrid } from '@/components/entity-client/entity-grid'
import { EntityTable, type EntityTableColumn } from '@/components/entity-client/entity-table'
import { ViewToggle } from '@/components/entity-client/view-toggle'
import { EditShelf } from '@/components/edit-shelf'
import { TagCombobox } from '@/components/tag-combobox'
import { AssigneePicker } from '@/components/assignee-picker'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/rich-text-editor'
import { UnfurlInput } from '@/components/unfurl-input'
import { cn } from '@/lib/utils'
import { stripMarkdown } from '@/lib/strip-markdown'
import { type BaseEntity } from '@/types/entities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemType = 'favorite' | 'flag' | 'restaurant' | 'note' | 'idea' | 'article'

type View = 'grid' | 'table' | 'stickies'

export interface LibraryItem extends BaseEntity {
  assignee_id: string | null
  assignee_type: string | null
  title: string
  url: string | null
  source: string | null
  excerpt: string | null
  body: string | null
  type: ItemType
  location_name: string | null
  latitude: number | null
  longitude: number | null
  image_url: string | null
  is_public: boolean
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

function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

const TABLE_COLUMNS: EntityTableColumn<LibraryItem>[] = [
  {
    key: 'title',
    label: 'Title',
    render: (item) => <span className="font-medium truncate">{item.title}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    render: (item) => {
      const cfg = TYPE_CONFIG[item.type]
      const Icon = cfg.icon
      return (
        <Badge variant="secondary" className="text-xs">
          <Icon className={cn('h-3 w-3 mr-1', cfg.color)} />
          {cfg.label}
        </Badge>
      )
    },
  },
  {
    key: 'url',
    label: 'URL',
    render: (item) => {
      const domain = domainFromUrl(item.url)
      if (!domain || !item.url) return <span className="text-muted-foreground">—</span>
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-400 hover:underline truncate max-w-[160px] inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          {domain}
        </a>
      )
    },
  },
  {
    key: 'tags',
    label: 'Tags',
    render: (item) => (
      <div className="flex items-center gap-1">
        {(item.tags ?? []).slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
            {tag}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'created_at',
    label: 'Created',
    render: (item) => (
      <span className="text-xs text-muted-foreground">
        {new Date(item.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </span>
    ),
  },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LibraryClient({ initialItems, initialItemId }: { initialItems: LibraryItem[]; initialItemId?: string }) {
  const [items, setItems] = useState<LibraryItem[]>(initialItems)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<View>('grid')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const supabase = createClient()
  const initialHandled = useRef(false)

  // ----- Resolve initialItemId to seq_id -----
  useEffect(() => {
    if (!initialItemId || initialHandled.current || items.length === 0) return
    initialHandled.current = true
    const isNumeric = /^\d+$/.test(initialItemId)
    const item = isNumeric
      ? items.find((i) => i.seq_id === Number(initialItemId))
      : items.find((i) => i.id === initialItemId)
    if (item?.seq_id !== undefined && item.seq_id !== null) setSelectedId(item.seq_id)
  }, [items, initialItemId])

  // ----- Read URL params on mount -----
  useEffect(() => {
    if (initialItemId) return // skip URL id param when initialItemId is provided
    const idParam = readParam('id')
    if (idParam) {
      const n = Number(idParam)
      if (!Number.isNaN(n)) setSelectedId(n)
    }
    const viewParam = readParam('view')
    if (viewParam === 'table') setView('table')
    const qParam = readParam('q')
    if (qParam) setSearch(qParam)
    const typeParam = readParam('type')
    if (typeParam && ALL_TYPES.includes(typeParam as ItemType)) {
      setTypeFilter(typeParam as ItemType)
    }
    const tagParam = readParam('tag')
    if (tagParam) setSelectedTag(tagParam)
    const assigneeParam = readParam('assignee')
    if (assigneeParam) setAssigneeFilter(assigneeParam)
  }, [])

  // ----- Derive selected entity -----
  const selectedEntity = useMemo(
    () =>
      selectedId !== null
        ? items.find((e) => e.seq_id === selectedId) ?? null
        : null,
    [items, selectedId],
  )

  // ----- Collect all tags -----
  const allTags = useMemo(() => {
    const tagCount = new Map<string, number>()
    for (const e of items) {
      for (const t of e.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
    }
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  }, [items])

  // ----- Type counts -----
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of ALL_TYPES) counts[t] = 0
    for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1
    return counts
  }, [items])

  // ----- Filter entities -----
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
          i.url?.toLowerCase().includes(q) ||
          i.excerpt?.toLowerCase().includes(q) ||
          i.body?.toLowerCase().includes(q) ||
          (i.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          i.location_name?.toLowerCase().includes(q) ||
          i.source?.toLowerCase().includes(q),
      )
    }
    if (selectedTag) {
      result = result.filter((i) => (i.tags ?? []).includes(selectedTag))
    }
    if (assigneeFilter) {
      result = result.filter((i) => i.assignee_id === assigneeFilter)
    }
    return result
  }, [items, typeFilter, search, selectedTag, assigneeFilter])

  // ----- URL sync for filters (replaceState) -----
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (selectedId !== null) params.set('id', String(selectedId))
    else params.delete('id')
    if (search) params.set('q', search)
    else params.delete('q')
    if (typeFilter !== 'all') params.set('type', typeFilter)
    else params.delete('type')
    if (selectedTag) params.set('tag', selectedTag)
    else params.delete('tag')
    if (assigneeFilter) params.set('assignee', assigneeFilter)
    else params.delete('assignee')
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [search, typeFilter, selectedTag, assigneeFilter, selectedId])

  // ----- Shelf open / close with pushState -----
  const openShelf = useCallback((entity: LibraryItem) => {
    if (entity.seq_id === null) return
    setSelectedId(entity.seq_id)
    const params = new URLSearchParams(window.location.search)
    params.set('id', String(entity.seq_id))
    const qs = params.toString()
    window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [])

  const closeShelf = useCallback(() => {
    setSelectedId(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('id')
    const qs = params.toString()
    window.history.pushState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [])

  // popstate listener — browser back/forward
  useEffect(() => {
    const handler = () => {
      const idParam = new URLSearchParams(window.location.search).get('id')
      if (idParam) {
        const n = Number(idParam)
        if (!Number.isNaN(n)) { setSelectedId(n); return }
      }
      setSelectedId(null)
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // ----- Real-time Supabase subscription -----
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
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'library_items' },
        (payload) => {
          const updated = payload.new as LibraryItem
          setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'library_items' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setItems((prev) => prev.filter((i) => i.id !== deletedId))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- Tag change handler -----
  const handleTagChange = useCallback((tag: string | null) => {
    setSelectedTag(tag)
  }, [])

  // ----- CRUD -----
  const createItem = useCallback(
    async (fields: Omit<LibraryItem, 'id' | 'seq_id' | 'tenant_id' | 'assignee_id' | 'assignee_type' | 'created_at' | 'updated_at' | 'image_url'>) => {
      const tempId = `temp-${Date.now()}`
      const optimistic: LibraryItem = {
        ...fields,
        id: tempId,
        seq_id: null,
        tenant_id: '',
        assignee_id: null,
        assignee_type: null,
        image_url: null,
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
        const json = await res.json() as { error?: string; data?: LibraryItem }
        if (!res.ok) throw new Error(json.error ?? 'Failed to create item')
        setItems((prev) => prev.map((i) => (i.id === tempId ? (json.data as LibraryItem) : i)))
        toast({ type: 'success', message: 'Item created' })
      } catch (err) {
        setItems((prev) => prev.filter((i) => i.id !== tempId))
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
      }
    },
    [],
  )

  const updateItemField = useCallback(
    async (itemId: string, fields: Record<string, unknown>) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? ({ ...i, ...fields, updated_at: new Date().toISOString() } as LibraryItem)
            : i,
        ),
      )
      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'library_items', id: itemId, fields }),
        })
        const json = await res.json() as { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
      }
    },
    [],
  )

  const deleteItem = useCallback(
    async (itemId: string) => {
      const prev = items
      setItems((i) => i.filter((x) => x.id !== itemId))
      closeShelf()
      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'library_items', id: itemId }),
        })
        const json = await res.json() as { error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        toast({ type: 'success', message: 'Item deleted' })
      } catch (err) {
        setItems(prev)
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      }
    },
    [items, closeShelf],
  )

  // ----- Render -----
  return (
    <div className="flex flex-col h-full">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold shrink-0">Library</h1>
        <div className="flex items-center gap-2">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search library..."
            tags={allTags}
            selectedTag={selectedTag}
            onTagChange={handleTagChange}
          />
          <ViewToggle onChange={setView} defaultView="grid" />
          <Button onClick={() => setIsCreating(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
            typeFilter === 'all'
              ? 'bg-white text-black border border-black'
              : 'bg-muted text-muted-foreground hover:text-foreground',
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
                  ? 'bg-white text-black border border-black'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
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
          {items.length === 0
            ? 'No items yet. Click "+ Add Item" to get started.'
            : 'No items match your filters.'}
        </div>
      ) : view === 'grid' ? (
        <EntityGrid>
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} onClick={() => openShelf(item)} />
          ))}
        </EntityGrid>
      ) : (
        <EntityTable<LibraryItem>
          columns={TABLE_COLUMNS}
          rows={filtered}
          onRowClick={openShelf}
        />
      )}

      {/* Edit shelf for existing item */}
      {selectedEntity && (
        <EntityShelf
          entity={selectedEntity}
          entityType="library_item"
          onClose={closeShelf}
          title={TYPE_CONFIG[selectedEntity.type].label}
          headerRight={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteItem(selectedEntity.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        >
          <LibraryShelfContent
            item={selectedEntity}
            onUpdate={updateItemField}
          />
        </EntityShelf>
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
        {(item.tags ?? []).slice(0, 3).map((tag) => (
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
// Shelf content (all subtypes)
// ---------------------------------------------------------------------------

export function LibraryShelfContent({
  item,
  onUpdate,
}: {
  item: LibraryItem
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
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
  const [tags, setTags] = useState<string[]>(item.tags ?? [])
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
    setTags(item.tags ?? [])
    setIsPublic(item.is_public)
  }, [item])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(item.id, fields)
  }

  const showUrl = type === 'favorite' || type === 'article' || type === 'flag' || type === 'restaurant'
  const showSource = type === 'article'
  const showExcerpt = type === 'article'
  const showBody = type === 'note' || type === 'idea'
  const showLocation = type === 'restaurant' || type === 'flag'
  const showCoords = type === 'restaurant'

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveField({ title: e.target.value })}
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
            saveField({ type: val })
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
          onBlur={(v) => saveField({ url: v || null })}
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
            onBlur={(e) => saveField({ source: e.target.value || null })}
            placeholder="e.g. NY Times, Hacker News"
            className="text-sm"
          />
        </div>
      )}

      {/* Excerpt */}
      {showExcerpt && (
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Excerpt</label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            onBlur={(e) => saveField({ excerpt: e.target.value || null })}
            placeholder="Short description or teaser..."
            className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
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
              saveField({ body: md || null })
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
            onBlur={(e) => saveField({ location_name: e.target.value || null })}
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
              onBlur={(e) => saveField({ latitude: e.target.value ? parseFloat(e.target.value) : null })}
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
              onBlur={(e) => saveField({ longitude: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="0.000000"
              className="text-sm"
            />
          </div>
        </div>
      )}

      {/* Assignee */}
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Assignee</label>
        <AssigneePicker
          value={
            item.assignee_id && item.assignee_type
              ? { id: item.assignee_id, type: item.assignee_type as 'human' | 'agent' }
              : null
          }
          onChange={(actor) => {
            saveField({
              assignee_id: actor?.id ?? null,
              assignee_type: actor?.type ?? null,
            })
          }}
        />
      </div>

      {/* Tags */}
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
        <TagCombobox
          selected={tags}
          onChange={(newTags) => {
            setTags(newTags)
            saveField({ tags: newTags })
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
            saveField({ is_public: e.target.checked })
          }}
          className="rounded border-input"
        />
        <span className="text-sm">Public</span>
      </label>
    </div>
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
  onCreate: (fields: Omit<LibraryItem, 'id' | 'seq_id' | 'tenant_id' | 'assignee_id' | 'assignee_type' | 'created_at' | 'updated_at' | 'image_url'>) => Promise<void>
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
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short description or teaser..."
              className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
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
