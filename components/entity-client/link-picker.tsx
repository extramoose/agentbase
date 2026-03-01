'use client'

// Inline chip link picker — matches TagCombobox pattern
// - Selected links show as small removable chips INSIDE the input field
// - On focus with empty input: show recent entities
// - Type to search: debounced via useEntitySearch hook
// - Click suggestion or press Enter to link
// - Press Backspace on empty input to remove last chip
// - Click X on chip to unlink
//
// Two modes:
// - Live mode (sourceType + sourceId): fetches/creates links via API
// - Pending mode (value + onChange): controlled component, no API calls

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
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

const ENTITY_PATH: Record<string, string> = {
  tasks:         '/tools/tasks',
  library_items: '/tools/library',
  companies:     '/tools/crm/companies',
  people:        '/tools/crm/people',
  deals:         '/tools/crm/deals',
}

function getChipHref(entityType: string, seqId?: number): string | null {
  const base = ENTITY_PATH[entityType]
  if (!base || seqId == null) return null
  return `${base}?id=${seqId}`
}

// ---------------------------------------------------------------------------
// Name resolution (live mode)
// ---------------------------------------------------------------------------

interface RawLink {
  link_id: string
  target_type: string
  target_id: string
  created_at: string
}

interface ResolvedEntity {
  name: string
  seqId?: number
}

async function resolveNames(links: RawLink[]): Promise<Map<string, ResolvedEntity>> {
  const supabase = createClient()
  const nameMap = new Map<string, ResolvedEntity>()

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
        supabase.from('tasks').select('id,title,ticket_id,seq_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`tasks:${row.id}`, { name: `Task #${row.ticket_id}: ${row.title}`, seqId: row.seq_id ?? undefined })
          })
      )
    } else if (type === 'companies') {
      queries.push(
        supabase.from('companies').select('id,name,seq_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`companies:${row.id}`, { name: row.name, seqId: row.seq_id ?? undefined })
          })
      )
    } else if (type === 'people') {
      queries.push(
        supabase.from('people').select('id,name,seq_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`people:${row.id}`, { name: row.name, seqId: row.seq_id ?? undefined })
          })
      )
    } else if (type === 'library_items') {
      queries.push(
        supabase.from('library_items').select('id,title,seq_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`library_items:${row.id}`, { name: row.title, seqId: row.seq_id ?? undefined })
          })
      )
    } else if (type === 'deals') {
      queries.push(
        supabase.from('deals').select('id,title,seq_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`deals:${row.id}`, { name: row.title, seqId: row.seq_id ?? undefined })
          })
      )
    }
  }

  await Promise.all(queries)
  return nameMap
}

// ---------------------------------------------------------------------------
// Batch link creation helper
// ---------------------------------------------------------------------------

export async function batchCreateLinks(
  sourceType: string,
  sourceId: string,
  links: EntitySearchResult[],
) {
  await Promise.all(
    links.map(link =>
      fetch('/api/commands/create-entity-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          target_type: link.type,
          target_id: link.id,
        }),
      })
    )
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkPickerProps {
  // Live mode: provide sourceType + sourceId
  sourceType?: string
  sourceId?: string
  // Pending mode: provide value + onChange (controlled, no API calls)
  value?: EntitySearchResult[]
  onChange?: (links: EntitySearchResult[]) => void
  className?: string
}

// Unified chip type for rendering
interface ChipLink {
  key: string
  entityType: string
  entityId: string
  name: string
  seqId?: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPicker({ sourceType, sourceId, value, onChange, className }: LinkPickerProps) {
  const isPending = value !== undefined && onChange !== undefined

  // Live-mode state
  const [liveLinks, setLiveLinks] = useState<{ link_id: string; target_type: string; target_id: string; name: string; seq_id?: number }[]>([])
  const [loadingLinks, setLoadingLinks] = useState(!isPending)

  // Combobox state
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)

  // Entity search via shared hook
  const { results, recentResults, loading: searching } = useEntitySearch(inputValue)

  // Unified chip list for display
  const chips: ChipLink[] = useMemo(() =>
    isPending
      ? value.map(v => ({ key: `${v.type}-${v.id}`, entityType: v.type, entityId: v.id, name: v.name, seqId: v.seq_id }))
      : liveLinks.map(l => ({ key: l.link_id, entityType: l.target_type, entityId: l.target_id, name: l.name, seqId: l.seq_id })),
    [isPending, value, liveLinks],
  )

  // Stable set of linked entity keys for filtering
  const linkedKeys = useMemo(
    () => new Set(chips.map(c => `${c.entityType}:${c.entityId}`)),
    [chips],
  )

  // ------- Fetch current links (live mode only) -------

  const fetchLinks = useCallback(async () => {
    if (isPending) return
    try {
      const res = await fetch(`/api/entity-links?sourceType=${sourceType}&sourceId=${sourceId}`)
      if (!res.ok) { setLoadingLinks(false); return }
      const { data } = (await res.json()) as { data: RawLink[] }
      if (!data || data.length === 0) {
        setLiveLinks([])
        setLoadingLinks(false)
        return
      }
      const nameMap = await resolveNames(data)
      setLiveLinks(
        data.map(link => {
          const resolved = nameMap.get(`${link.target_type}:${link.target_id}`)
          return {
            link_id: link.link_id,
            target_type: link.target_type,
            target_id: link.target_id,
            name: resolved?.name ?? 'Unknown',
            seq_id: resolved?.seqId,
          }
        }),
      )
    } finally {
      setLoadingLinks(false)
    }
  }, [sourceType, sourceId, isPending])

  useEffect(() => {
    if (isPending) return
    setLoadingLinks(true)
    fetchLinks()
  }, [fetchLinks, isPending])

  // ------- Compute display items (filter out already-linked and self) -------

  const isSearching = inputValue.trim().length >= 2
  const displayItems = useMemo(() => {
    const items = isSearching ? results : recentResults
    return items.filter(item => {
      if (linkedKeys.has(`${item.type}:${item.id}`)) return false
      if (!isPending && item.type === sourceType && item.id === sourceId) return false
      return true
    })
  }, [isSearching, results, recentResults, linkedKeys, sourceType, sourceId, isPending])

  // ------- Add / remove handlers -------

  const handleAdd = useCallback((result: EntitySearchResult) => {
    if (isPending) {
      onChange([...value, result])
    } else {
      fetch('/api/commands/create-entity-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          target_type: result.type,
          target_id: result.id,
        }),
      }).then(res => {
        if (res.ok) fetchLinks()
      }).catch(() => {})
    }
    setInputValue('')
    setOpen(false)
    inputRef.current?.focus()
  }, [isPending, value, onChange, sourceType, sourceId, fetchLinks])

  const handleRemove = useCallback((chip: ChipLink) => {
    if (isPending) {
      onChange(value.filter(v => !(v.type === chip.entityType && v.id === chip.entityId)))
    } else {
      // Optimistic remove
      setLiveLinks(prev => prev.filter(l => l.link_id !== chip.key))

      fetch('/api/commands/delete-entity-link', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: sourceType,
          source_id: sourceId,
          target_type: chip.entityType,
          target_id: chip.entityId,
        }),
      }).then(res => {
        if (!res.ok) fetchLinks() // revert on failure
      })
    }
  }, [isPending, value, onChange, sourceType, sourceId, fetchLinks])

  // ------- Keyboard handling -------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && displayItems[activeIndex]) {
        handleAdd(displayItems[activeIndex])
      }
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      handleRemove(chips[chips.length - 1])
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

  // ------- Loading state (live mode only) -------

  if (!isPending && loadingLinks) {
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
        {chips.map(chip => {
          const colors = ENTITY_COLORS[chip.entityType] ?? 'bg-zinc-500/20 text-zinc-400'
          const href = getChipHref(chip.entityType, chip.seqId)
          const inner = (
            <>
              <span className={cn('rounded px-1 py-0 text-[10px] font-medium leading-tight', colors)}>
                {TABLE_LABELS[chip.entityType] ?? chip.entityType}
              </span>
              <span className="truncate max-w-[150px]">{chip.name}</span>
            </>
          )
          return (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {href ? (
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1">{inner}</span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(chip) }}
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
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={chips.length === 0 ? 'Link entities...' : ''}
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
                  onMouseDown={(e) => { e.preventDefault(); handleAdd(item) }}
                >
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0', colors)}>
                    {TABLE_LABELS[item.type] ?? item.type}
                  </span>
                  <span className="truncate">{item.subtitle ? <><span className="text-muted-foreground">{item.subtitle}</span>{" — "}{item.name}</> : item.name}</span>
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
