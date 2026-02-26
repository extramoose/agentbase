'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { formatActivityEvent } from '@/lib/format-activity'

type ActivityEntry = {
  id: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  event_type: string
  actor_id: string
  actor_type: 'human' | 'agent'
  old_value: string | null
  new_value: string | null
  body: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

const ENTITY_COLORS: Record<string, string> = {
  tasks:          'bg-blue-500/20 text-blue-400',
  meetings:       'bg-green-500/20 text-green-400',
  library_items:  'bg-yellow-500/20 text-yellow-400',
  diary_entries:  'bg-purple-500/20 text-purple-400',
  grocery_items:  'bg-orange-500/20 text-orange-400',
  companies:      'bg-red-500/20 text-red-400',
  people:         'bg-pink-500/20 text-pink-400',
  deals:          'bg-emerald-500/20 text-emerald-400',
}

const ENTITY_TYPES = [
  'tasks', 'meetings', 'library_items', 'diary_entries',
  'grocery_items', 'companies', 'people', 'deals',
] as const

function formatEntityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface HistoryClientProps {
  initialEntries: ActivityEntry[]
}

export function HistoryClient({ initialEntries }: HistoryClientProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialEntries.length >= 50)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Load more entries
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const { data } = await supabase.rpc('get_activity_log', {
      p_limit: 50,
      p_offset: entries.length,
      ...(entityFilter ? { p_entity_type: entityFilter } : {}),
      ...(search.trim() ? { p_search: search.trim() } : {}),
    })
    const newEntries = (data ?? []) as ActivityEntry[]
    setEntries(prev => [...prev, ...newEntries])
    setHasMore(newEntries.length >= 50)
    setLoading(false)
  }, [loading, hasMore, entries.length, entityFilter, search, supabase])

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  // Re-fetch when filter or search changes
  useEffect(() => {
    let cancelled = false
    const reload = async () => {
      setLoading(true)
      const { data } = await supabase.rpc('get_activity_log', {
        p_limit: 50,
        p_offset: 0,
        ...(entityFilter ? { p_entity_type: entityFilter } : {}),
        ...(search.trim() ? { p_search: search.trim() } : {}),
      })
      if (cancelled) return
      const results = (data ?? []) as ActivityEntry[]
      setEntries(results)
      setHasMore(results.length >= 50)
      setLoading(false)
    }
    const timeout = setTimeout(reload, search.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [entityFilter, search, supabase])

  // Realtime subscription — prepend new entries
  useEffect(() => {
    const channel = supabase
      .channel('history:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          const newEntry = payload.new as ActivityEntry
          setEntries(prev => {
            if (prev.some(e => e.id === newEntry.id)) return prev
            return [newEntry, ...prev]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Client-side filtering for realtime entries that may not match server filter
  const filteredEntries = useMemo(() => {
    return entries
  }, [entries])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">History</h1>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search activity..."
      >
        <button
          onClick={() => setEntityFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            entityFilter === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        {ENTITY_TYPES.map(type => (
          <button
            key={type}
            onClick={() => setEntityFilter(entityFilter === type ? null : type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              entityFilter === type
                ? ENTITY_COLORS[type] ?? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {formatEntityType(type)}
          </button>
        ))}
      </SearchFilterBar>

      {/* Activity list */}
      <div className="space-y-1">
        {filteredEntries.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity found.
          </p>
        ) : (
          filteredEntries.map(entry => (
            <div
              key={entry.id}
              className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors"
            >
              <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} compact />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 ${ENTITY_COLORS[entry.entity_type] ?? 'bg-muted text-muted-foreground'}`}
                  >
                    {formatEntityType(entry.entity_type)}
                  </Badge>
                  <span className="text-sm text-foreground">
                    {formatActivityEvent(entry)}
                  </span>
                </div>
                {entry.event_type === 'commented' && entry.body && (
                  <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {entry.body}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  )
}
