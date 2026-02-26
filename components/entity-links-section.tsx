'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Link as LinkIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Shared entity helpers (mirrors history-client.tsx)
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<string, string> = {
  tasks:          'bg-blue-500/20 text-blue-400',
  meetings:       'bg-green-500/20 text-green-400',
  library_items:  'bg-yellow-500/20 text-yellow-400',
  diary_entries:  'bg-purple-500/20 text-purple-400',
  grocery_items:  'bg-orange-500/20 text-orange-400',
  companies:      'bg-red-500/20 text-red-400',
  people:         'bg-pink-500/20 text-pink-400',
  deals:          'bg-emerald-500/20 text-emerald-400',
  essays:         'bg-indigo-500/20 text-indigo-400',
}

function getEntityUrl(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'tasks':         return `/tools/tasks/${entityId}`
    case 'meetings':      return `/tools/meetings/${entityId}`
    case 'library_items': return `/tools/library/${entityId}`
    case 'companies':     return `/tools/crm/companies/${entityId}`
    case 'people':        return `/tools/crm/people/${entityId}`
    case 'deals':         return `/tools/crm/deals/${entityId}`
    case 'essays':        return `/tools/essays/${entityId}`
    default:              return ''
  }
}

function formatEntityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityLink {
  link_id: string
  target_type: string
  target_id: string
  created_at: string
}

interface ResolvedLink extends EntityLink {
  name: string
}

interface SearchResult {
  id: string
  type: string
  name: string
}

interface EntityLinksSectionProps {
  entityType: string
  entityId: string
  editMode?: boolean
}

// ---------------------------------------------------------------------------
// Name resolution: batch by entity type
// ---------------------------------------------------------------------------

async function resolveNames(links: EntityLink[]): Promise<Map<string, string>> {
  const supabase = createClient()
  const nameMap = new Map<string, string>()

  // Group IDs by type
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
            for (const row of data ?? []) {
              nameMap.set(`tasks:${row.id}`, `Task #${row.ticket_id}: ${row.title}`)
            }
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
    } else if (type === 'meetings') {
      queries.push(
        supabase.from('meetings').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`meetings:${row.id}`, row.title)
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
    } else if (type === 'essays') {
      queries.push(
        supabase.from('essays').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`essays:${row.id}`, row.title)
          })
      )
    }
  }

  await Promise.all(queries)
  return nameMap
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityLinksSection({ entityType, entityId, editMode }: EntityLinksSectionProps) {
  const router = useRouter()
  const [links, setLinks] = useState<ResolvedLink[]>([])
  const [loading, setLoading] = useState(true)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Fetch links + resolve names
  const fetchLinks = useCallback(async () => {
    const res = await fetch(`/api/entity-links?sourceType=${entityType}&sourceId=${entityId}`)
    if (!res.ok) { setLoading(false); return }
    const { data } = (await res.json()) as { data: EntityLink[] }
    if (!data || data.length === 0) {
      setLinks([])
      setLoading(false)
      return
    }
    const nameMap = await resolveNames(data)
    setLinks(
      data.map(link => ({
        ...link,
        name: nameMap.get(`${link.target_type}:${link.target_id}`) ?? 'Unknown',
      }))
    )
    setLoading(false)
  }, [entityType, entityId])

  useEffect(() => {
    setLoading(true)
    fetchLinks()
  }, [fetchLinks])

  // Search entities (debounced, min 2 chars)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = searchQuery.trim()
    if (trimmed.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)

    debounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      const pattern = `%${trimmed}%`

      const [tasksRes, libraryRes, companiesRes, peopleRes] = await Promise.all([
        supabase.from('tasks').select('id,title,ticket_id').ilike('title', pattern).limit(5),
        supabase.from('library_items').select('id,title').ilike('title', pattern).limit(3),
        supabase.from('companies').select('id,name').ilike('name', pattern).limit(3),
        supabase.from('people').select('id,name').ilike('name', pattern).limit(3),
      ])

      const results: SearchResult[] = []

      for (const t of tasksRes.data ?? []) {
        results.push({ id: t.id, type: 'tasks', name: `Task #${t.ticket_id}: ${t.title}` })
      }
      for (const l of libraryRes.data ?? []) {
        results.push({ id: l.id, type: 'library_items', name: l.title })
      }
      for (const c of companiesRes.data ?? []) {
        results.push({ id: c.id, type: 'companies', name: c.name })
      }
      for (const p of peopleRes.data ?? []) {
        results.push({ id: p.id, type: 'people', name: p.name })
      }

      // Filter out links that already exist + self
      const existing = new Set(links.map(l => `${l.target_type}:${l.target_id}`))
      const filtered = results.filter(r => {
        if (r.type === entityType && r.id === entityId) return false
        return !existing.has(`${r.type}:${r.id}`)
      })

      setSearchResults(filtered)
      setSearchLoading(false)
      setSearchOpen(filtered.length > 0)
      setActiveIndex(-1)
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, links, entityType, entityId])

  // Add link (optimistic)
  const addLink = useCallback(async (result: SearchResult) => {
    setSearchQuery('')
    setSearchOpen(false)
    setSearchResults([])
    inputRef.current?.focus()

    // Optimistic add
    const tempLink: ResolvedLink = {
      link_id: `temp-${Date.now()}`,
      target_type: result.type,
      target_id: result.id,
      created_at: new Date().toISOString(),
      name: result.name,
    }
    setLinks(prev => [...prev, tempLink])

    const res = await fetch('/api/commands/create-entity-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: entityType,
        source_id: entityId,
        target_type: result.type,
        target_id: result.id,
      }),
    })

    if (!res.ok) {
      // Revert
      setLinks(prev => prev.filter(l => l.link_id !== tempLink.link_id))
    } else {
      // Re-fetch to get real link_id
      fetchLinks()
    }
  }, [entityType, entityId, fetchLinks])

  // Delete link (optimistic)
  const deleteLink = useCallback(async (link: ResolvedLink) => {
    setLinks(prev => prev.filter(l => l.link_id !== link.link_id))

    const res = await fetch('/api/commands/delete-entity-link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: entityType,
        source_id: entityId,
        target_type: link.target_type,
        target_id: link.target_id,
      }),
    })

    if (!res.ok) {
      // Revert by re-fetching
      fetchLinks()
    }
  }, [entityType, entityId, fetchLinks])

  // Keyboard nav for search
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, searchResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && searchResults[activeIndex]) {
        addLink(searchResults[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setSearchOpen(false)
    }
  }

  // Group search results by type
  const groupedResults = searchResults.reduce<Record<string, SearchResult[]>>((acc, r) => {
    ;(acc[r.type] ??= []).push(r)
    return acc
  }, {})

  // If loading, show spinner
  if (loading) {
    return (
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Links</label>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // If no links and not in edit mode, render nothing
  if (links.length === 0 && !editMode) return null

  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1 block">Links</label>

      {/* Existing link chips */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {links.map(link => {
            const colors = ENTITY_COLORS[link.target_type] ?? 'bg-zinc-500/20 text-zinc-400'
            const url = getEntityUrl(link.target_type, link.target_id)
            return (
              <span
                key={link.link_id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  colors
                )}
              >
                <span className="opacity-70 mr-0.5">{formatEntityType(link.target_type)}</span>
                <button
                  type="button"
                  onClick={() => { if (url) router.push(url) }}
                  className="hover:underline truncate max-w-[200px]"
                >
                  {link.name}
                </button>
                {editMode && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteLink(link) }}
                    className="hover:opacity-100 opacity-60 transition-opacity ml-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Add search combobox (edit mode only) */}
      {editMode && (
        <div className="relative">
          <div className="flex items-center gap-1.5 min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus-within:ring-1 focus-within:ring-ring">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => searchQuery.trim().length >= 2 && searchResults.length > 0 && setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Link an entity..."
              className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
            />
            {searchLoading && <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />}
          </div>

          {/* Search dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
              <ul className="max-h-56 overflow-auto py-1">
                {(() => {
                  let idx = -1
                  return Object.entries(groupedResults).map(([type, items]) => (
                    <li key={type}>
                      <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {formatEntityType(type)}
                      </div>
                      {items.map(item => {
                        idx++
                        const i = idx
                        const colors = ENTITY_COLORS[item.type] ?? 'bg-zinc-500/20 text-zinc-400'
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={cn(
                              'px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2',
                              i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                            )}
                            onMouseDown={(e) => { e.preventDefault(); addLink(item) }}
                            onMouseEnter={() => setActiveIndex(i)}
                          >
                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', colors)}>
                              {formatEntityType(item.type)}
                            </span>
                            <span className="truncate">{item.name}</span>
                          </div>
                        )
                      })}
                    </li>
                  ))
                })()}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
