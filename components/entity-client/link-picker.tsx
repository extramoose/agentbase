'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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

/** Maps search API type keys to table names used by entity-link API */
const SEARCH_TYPE_TO_TABLE: Record<string, string> = {
  tasks:     'tasks',
  people:    'people',
  companies: 'companies',
  deals:     'deals',
  library:   'library_items',
}

const TABLE_LABELS: Record<string, string> = {
  tasks:         'Tasks',
  library_items: 'Library Items',
  companies:     'Companies',
  people:        'People',
  deals:         'Deals',
}

interface SearchResult {
  id: string
  type: string // table name: tasks, library_items, companies, people, deals
  name: string
}

function extractName(type: string, row: Record<string, unknown>): string {
  if (type === 'tasks') return `Task #${row.ticket_id}: ${row.title}`
  if (type === 'library' || type === 'library_items') return (row.title as string) ?? 'Untitled'
  return (row.name as string) ?? (row.title as string) ?? 'Untitled'
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkPickerProps {
  sourceType: string   // table name: 'tasks', 'library_items', etc.
  sourceId: string
  linkedIds: Set<string> // e.g. "tasks:<uuid>"
  onLinkCreated: () => void
  onClose: () => void
}

// Display order for grouped results
const TYPE_ORDER = ['tasks', 'library_items', 'companies', 'people', 'deals']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPicker({ sourceType, sourceId, linkedIds, onLinkCreated, onClose }: LinkPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [recentItems, setRecentItems] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Stabilise linkedIds so it doesn't re-trigger effects on every render
  const linkedKey = useMemo(() => [...linkedIds].sort().join(','), [linkedIds])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fetch recent entities on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/entities/recent')
        if (!res.ok) return
        const json = await res.json()
        const rows = json.data as { id: string; label: string; entity_type: string }[]
        if (cancelled || !Array.isArray(rows)) return
        const items: SearchResult[] = rows
          .filter(r => {
            const key = `${r.entity_type}:${r.id}`
            return !(r.entity_type === sourceType && r.id === sourceId) && !linkedIds.has(key)
          })
          .map(r => ({ id: r.id, type: r.entity_type, name: r.label }))
        setRecentItems(items)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Search (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`)
        if (!res.ok) { setLoading(false); return }
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
              const key = `${tableName}:${id}`
              // Skip self and already-linked
              if (tableName === sourceType && id === sourceId) continue
              if (linkedIds.has(key)) continue
              flat.push({ id, type: tableName, name: extractName(searchType, row) })
            }
          }
        }

        setResults(flat)
        setActiveIndex(-1)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sourceType, sourceId, linkedKey])

  // Create link
  const createLink = useCallback(async (result: SearchResult) => {
    if (creating) return
    setCreating(true)

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
        onLinkCreated()
        onClose()
      }
    } finally {
      setCreating(false)
    }
  }, [sourceType, sourceId, onLinkCreated, onClose, creating])

  // Keyboard nav
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && results[activeIndex]) {
        createLink(results[activeIndex])
      }
    }
  }

  // Decide which items to display: search results or recent entities
  const isSearching = query.trim().length >= 2
  const displayItems = isSearching ? results : recentItems

  // Group results by type in display order
  const grouped = TYPE_ORDER
    .map(type => ({
      type,
      items: displayItems.filter(r => r.type === type),
    }))
    .filter(g => g.items.length > 0)

  // Build flat index mapping for keyboard nav
  let flatIdx = -1

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[60]"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-[61] flex items-start justify-center pt-[20vh]">
        <div
          className="bg-popover border border-border rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search entities to link..."
              className="border-0 shadow-none focus-visible:ring-0 h-8 px-0"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 shrink-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {isSearching && !loading && results.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                No results found
              </div>
            ) : grouped.length === 0 && !isSearching ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                Type to search entities...
              </div>
            ) : (
              <ul className="py-1">
                {!isSearching && grouped.length > 0 && (
                  <li className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Recent
                  </li>
                )}
                {grouped.map(({ type, items }) => (
                  <li key={type}>
                    {isSearching && (
                      <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {TABLE_LABELS[type] ?? type}
                      </div>
                    )}
                    {items.map(item => {
                      flatIdx++
                      const idx = flatIdx
                      const colors = ENTITY_COLORS[item.type] ?? 'bg-zinc-500/20 text-zinc-400'
                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          className={cn(
                            'px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2',
                            idx === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                          )}
                          onClick={() => createLink(item)}
                          onMouseEnter={() => setActiveIndex(idx)}
                        >
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0', colors)}>
                            {TABLE_LABELS[item.type] ?? item.type}
                          </span>
                          <span className="truncate">{item.name}</span>
                        </div>
                      )
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {creating && (
            <div className="px-3 py-2 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Linking...
            </div>
          )}
        </div>
      </div>
    </>
  )
}
