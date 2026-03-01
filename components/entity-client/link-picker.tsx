'use client'

// Inline chip link picker — matches TagCombobox pattern
// - Selected links show as small removable chips INSIDE the input field
// - On focus with empty input: show recent entities
// - Type to search: debounced via useEntitySearch hook
// - Click suggestion or press Enter to link
// - Press Backspace on empty input to remove last chip
// - Click X on chip to unlink

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useEntitySearch, type EntitySearchResult } from '@/hooks/use-entity-search'

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

interface ResolvedLink {
  link_id: string
  target_type: string
  target_id: string
  name: string
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
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)

  // Entity search via shared hook
  const { results, recentResults, loading: searching } = useEntitySearch(inputValue)

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

  // ------- Compute display items (filter out already-linked and self) -------

  const isSearching = inputValue.trim().length >= 2
  const displayItems = useMemo(() => {
    const items = isSearching ? results : recentResults
    return items.filter(item =>
      !linkedKeys.has(`${item.type}:${item.id}`) &&
      !(item.type === sourceType && item.id === sourceId)
    )
  }, [isSearching, results, recentResults, linkedKeys, sourceType, sourceId])

  // ------- Create link -------

  const addLink = useCallback(async (result: EntitySearchResult) => {
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
    setOpen(true)
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
