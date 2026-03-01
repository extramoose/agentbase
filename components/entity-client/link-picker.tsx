'use client'

// Inline chip link picker — matches TagCombobox pattern
// - Selected links show as small removable chips INSIDE the input field
// - On focus with empty input: show recent entities
// - Type to search: fetch from /api/search?q=...&limit=8 (debounced 300ms)
// - Click suggestion or press Enter to link
// - Press Backspace on empty input to remove last chip
// - Click X on chip to unlink

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<string, string> = {
  tasks:         'bg-blue-500/20 text-blue-400',
  library_items: 'bg-yellow-500/20 text-yellow-400',
  companies:     'bg-red-500/20 text-red-400',
  people:        'bg-pink-500/20 text-pink-400',
  deals:         'bg-emerald-500/20 text-emerald-400',
}

const TABLE_LABELS: Record<string, string> = {
  tasks:         'Task',
  library_items: 'Library',
  companies:     'Company',
  people:        'Person',
  deals:         'Deal',
}

/** Maps search API type keys to table names used by entity-link API */
const SEARCH_TYPE_TO_TABLE: Record<string, string> = {
  tasks:     'tasks',
  people:    'people',
  companies: 'companies',
  deals:     'deals',
  library:   'library_items',
}

interface SearchResult {
  id: string
  type: string // table name: tasks, library_items, companies, people, deals
  name: string
}

interface ResolvedLink {
  link_id: string
  target_type: string
  target_id: string
  name: string
}

function extractName(type: string, row: Record<string, unknown>): string {
  if (type === 'tasks') return `Task #${row.ticket_id}: ${row.title}`
  if (type === 'library' || type === 'library_items') return (row.title as string) ?? 'Untitled'
  return (row.name as string) ?? (row.title as string) ?? 'Untitled'
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

interface RawLink {
  link_id: string
  target_type: string
  target_id: string
  created_at: string
}

async function resolveNames(links: RawLink[]): Promise<Map<string, string>> {
  const supabase = createClient()
  const nameMap = new Map<string, string>()

  const byType = new Map<string, string[]>()
  for (const link of links) {
    const ids = byType.get(link.target_type) ?? []
    ids.push(link.target_id)
    byType.set(link.target_type, ids)
  }

  const queries: PromiseLike<void>[] = []

  for (const [type, ids] of byType) {
    const uniqueIds = [...new Set(ids)]
    if (type === 'tasks') {
      queries.push(
        supabase.from('tasks').select('id,title,ticket_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`tasks:${row.id}`, `Task #${row.ticket_id}: ${row.title}`)
          })
      )
    } else if (type === 'companies') {
      queries.push(
        supabase.from('companies').select('id,name').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`companies:${row.id}`, row.name)
          })
      )
    } else if (type === 'people') {
      queries.push(
        supabase.from('people').select('id,name').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`people:${row.id}`, row.name)
          })
      )
    } else if (type === 'library_items') {
      queries.push(
        supabase.from('library_items').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`library_items:${row.id}`, row.title)
          })
      )
    } else if (type === 'deals') {
      queries.push(
        supabase.from('deals').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`deals:${row.id}`, row.title)
          })
      )
    }
  }

  await Promise.all(queries)
  return nameMap
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkPickerProps {
  sourceType: string   // table name: 'tasks', 'library_items', etc.
  sourceId: string
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPicker({ sourceType, sourceId, className }: LinkPickerProps) {
  // Current links
  const [links, setLinks] = useState<ResolvedLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(true)

  // Combobox state
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [recentItems, setRecentItems] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searching, setSearching] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Stable set of linked entity keys for filtering
  const linkedKeys = useMemo(
    () => new Set(links.map(l => `${l.target_type}:${l.target_id}`)),
    [links],
  )

  // ------- Fetch current links -------

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/entity-links?sourceType=${sourceType}&sourceId=${sourceId}`)
      if (!res.ok) { setLoadingLinks(false); return }
      const { data } = (await res.json()) as { data: RawLink[] }
      if (!data || data.length === 0) {
        setLinks([])
        setLoadingLinks(false)
        return
      }
      const nameMap = await resolveNames(data)
      setLinks(
        data.map(link => ({
          link_id: link.link_id,
          target_type: link.target_type,
          target_id: link.target_id,
          name: nameMap.get(`${link.target_type}:${link.target_id}`) ?? 'Unknown',
        })),
      )
    } finally {
      setLoadingLinks(false)
    }
  }, [sourceType, sourceId])

  useEffect(() => {
    setLoadingLinks(true)
    fetchLinks()
  }, [fetchLinks])

  // ------- Fetch recent entities (for empty-state suggestions) -------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/entities/recent')
        if (!res.ok) return
        const json = await res.json()
        const rows = json.data as { id: string; label: string; entity_type: string }[]
        if (cancelled || !Array.isArray(rows)) return
        setRecentItems(
          rows
            .filter(r => !(r.entity_type === sourceType && r.id === sourceId))
            .map(r => ({ id: r.id, type: r.entity_type, name: r.label })),
        )
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------- Debounced search -------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = inputValue.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setSearching(false)
      return
    }

    setSearching(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`)
        if (!res.ok) { setSearching(false); return }
        const json = await res.json()
        const data = json.data as Record<string, Record<string, unknown>[]> | undefined

        const flat: SearchResult[] = []
        if (data && typeof data === 'object') {
          for (const [searchType, rows] of Object.entries(data)) {
            if (!Array.isArray(rows)) continue
            const tableName = SEARCH_TYPE_TO_TABLE[searchType] ?? searchType
            for (const row of rows) {
              const id = row.id as string
              if (!id) continue
              // Skip self
              if (tableName === sourceType && id === sourceId) continue
              flat.push({ id, type: tableName, name: extractName(searchType, row) })
            }
          }
        }

        setSuggestions(flat)
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, sourceType, sourceId])

  // ------- Compute display items (filter out already-linked) -------

  const isSearching = inputValue.trim().length >= 2
  const displayItems = useMemo(() => {
    const items = isSearching ? suggestions : recentItems
    return items.filter(item => !linkedKeys.has(`${item.type}:${item.id}`))
  }, [isSearching, suggestions, recentItems, linkedKeys])

  // ------- Create link -------

  const addLink = useCallback(async (result: SearchResult) => {
    try {
      const res = await fetch('/api/commands/create-entity-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          target_type: result.type,
          target_id: result.id,
        }),
      })
      if (res.ok) {
        setInputValue('')
        setOpen(false)
        fetchLinks()
      }
    } catch { /* ignore */ }
    inputRef.current?.focus()
  }, [sourceType, sourceId, fetchLinks])

  // ------- Delete link (optimistic) -------

  const removeLink = useCallback(async (link: ResolvedLink) => {
    setLinks(prev => prev.filter(l => l.link_id !== link.link_id))

    const res = await fetch('/api/commands/delete-entity-link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: sourceType,
        source_id: sourceId,
        target_type: link.target_type,
        target_id: link.target_id,
      }),
    })

    if (!res.ok) fetchLinks() // revert on failure
  }, [sourceType, sourceId, fetchLinks])

  // ------- Keyboard handling -------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && displayItems[activeIndex]) {
        addLink(displayItems[activeIndex])
      }
    } else if (e.key === 'Backspace' && !inputValue && links.length > 0) {
      removeLink(links[links.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, displayItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // ------- Focus / blur handlers -------

  function handleFocus() {
    if (!inputValue.trim()) {
      setOpen(true)
    } else {
      setOpen(true)
    }
  }

  function handleClick() {
    setOpen(true)
  }

  if (loadingLinks) {
    return (
      <div className={cn('flex items-center min-h-9', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Input area with inline chips */}
      <div
        className="flex flex-wrap gap-1 min-h-9 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm cursor-text focus-within:ring-1 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {links.map(link => {
          const colors = ENTITY_COLORS[link.target_type] ?? 'bg-zinc-500/20 text-zinc-400'
          return (
            <span
              key={link.link_id}
              className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              <span className={cn('rounded px-1 py-0 text-[10px] font-medium leading-tight', colors)}>
                {TABLE_LABELS[link.target_type] ?? link.target_type}
              </span>
              <span className="truncate max-w-[150px]">{link.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeLink(link) }}
                className="hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onClick={handleClick}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={links.length === 0 ? 'Link entities...' : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
        />
        {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0 self-center" />}
      </div>

      {/* Suggestions dropdown */}
      {open && displayItems.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-48 overflow-auto py-1">
            {!isSearching && (
              <li className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Recent
              </li>
            )}
            {displayItems.map((item, i) => {
              const colors = ENTITY_COLORS[item.type] ?? 'bg-zinc-500/20 text-zinc-400'
              return (
                <li
                  key={`${item.type}-${item.id}`}
                  className={cn(
                    'px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2',
                    i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); addLink(item) }}
                >
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0', colors)}>
                    {TABLE_LABELS[item.type] ?? item.type}
                  </span>
                  <span className="truncate">{item.name}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Empty search results */}
      {open && isSearching && !searching && displayItems.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="px-3 py-3 text-sm text-muted-foreground text-center">
            No results found
          </div>
        </div>
      )}
    </div>
  )
}
