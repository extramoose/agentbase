'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Minus, Plus } from 'lucide-react'
import {
  formatActivityEvent,
  groupActivityItems,
  getMostSignificantItem,
  filterActivityItems,
  type ActivityLogEntry,
} from '@/lib/format-activity'
import { MarkdownRenderer } from '@/components/markdown-renderer'

function getEntityUrl(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'tasks':         return `/tools/tasks/${entityId}`
    case 'library_items': return `/tools/library/${entityId}`
    case 'companies':     return `/tools/crm/companies/${entityId}`
    case 'people':        return `/tools/crm/people/${entityId}`
    case 'deals':         return `/tools/crm/deals/${entityId}`
    default:              return ''
  }
}

const ENTITY_COLORS: Record<string, string> = {
  tasks:          'bg-blue-500/20 text-blue-400',
  library_items:  'bg-yellow-500/20 text-yellow-400',
  grocery_items:  'bg-orange-500/20 text-orange-400',
  companies:      'bg-red-500/20 text-red-400',
  people:         'bg-pink-500/20 text-pink-400',
  deals:          'bg-emerald-500/20 text-emerald-400',
}

const ENTITY_TYPES = [
  'tasks', 'library_items',
  'grocery_items', 'companies', 'people', 'deals',
] as const

function formatEntityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface HistoryClientProps {
  initialEntries: ActivityLogEntry[]
}

export function HistoryClient({ initialEntries }: HistoryClientProps) {
  const router = useRouter()
  const [entries, setEntries] = useState<ActivityLogEntry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const sentinelRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Refs to decouple loadMore identity from rapidly-changing state.
  // Without these, loadMore changes identity on every fetch cycle,
  // the IntersectionObserver re-creates, fires immediately, and loops.
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialEntries.length >= 50)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  function toggleGroup(groupKey: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  // Load more entries — stable identity (only changes on filter/search)
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    setLoading(true)
    const { data } = await supabase.rpc('get_activity_log', {
      p_limit: 50,
      p_offset: entriesRef.current.length,
      ...(entityFilter ? { p_entity_type: entityFilter } : {}),
      ...(search.trim() ? { p_search: search.trim() } : {}),
    })
    const newEntries = (data ?? []) as ActivityLogEntry[]
    setEntries(prev => [...prev, ...newEntries])
    hasMoreRef.current = newEntries.length >= 50
    loadingRef.current = false
    setLoading(false)
  }, [entityFilter, search])

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
      loadingRef.current = true
      setLoading(true)
      const { data } = await supabase.rpc('get_activity_log', {
        p_limit: 50,
        p_offset: 0,
        ...(entityFilter ? { p_entity_type: entityFilter } : {}),
        ...(search.trim() ? { p_search: search.trim() } : {}),
      })
      if (cancelled) return
      const results = (data ?? []) as ActivityLogEntry[]
      setEntries(results)
      hasMoreRef.current = results.length >= 50
      loadingRef.current = false
      setLoading(false)
    }
    const timeout = setTimeout(reload, search.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [entityFilter, search])

  // Realtime subscription — prepend new entries
  useEffect(() => {
    const channel = supabase
      .channel('history:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        (payload) => {
          const newEntry = payload.new as ActivityLogEntry
          setEntries(prev => {
            if (prev.some(e => e.id === newEntry.id)) return prev
            return [newEntry, ...prev]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Filter internal events, then group consecutive same-entity activity items
  const groups = useMemo(() => groupActivityItems(filterActivityItems(entries)), [entries])

  function renderSingleEntry(entry: ActivityLogEntry) {
    const isDeleted = entry.event_type === 'deleted'
    const entityUrl = entry.entity_id ? getEntityUrl(entry.entity_type, entry.entity_id) : ''
    const isClickable = !!entityUrl && !isDeleted
    return (
      <div
        key={entry.id}
        className={`flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors${isClickable ? ' cursor-pointer' : ''}`}
        onClick={isClickable ? () => router.push(entityUrl) : undefined}
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
            {entry.entity_label && !['created', 'deleted'].includes(entry.event_type) && (
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[160px]" title={entry.entity_label}>
                {entry.entity_label}
              </span>
            )}
            <span className={`text-sm ${isDeleted ? 'text-red-400' : 'text-foreground'}`}>
              {formatActivityEvent(entry)}
            </span>
          </div>
          {entry.event_type === 'commented' && entry.body && (
            <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <MarkdownRenderer content={entry.body} />
            </div>
          )}
        </div>
        <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
        </span>
      </div>
    )
  }

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
        {groups.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity found.
          </p>
        ) : (
          groups.map(group => {
            // Single-item group — render exactly as before
            if (group.items.length === 1) {
              return renderSingleEntry(group.items[0])
            }

            // Multi-item group — collapsed/expandable row
            const groupKey = group.firstItem.id
            const isExpanded = expandedGroups.has(groupKey)
            const headline = getMostSignificantItem(group.items)
            const extraCount = group.items.length - 1
            const isCreateWithFields = headline.event_type === 'created' && group.items.every(i => i === headline || i.event_type === 'field_updated')

            return (
              <div key={groupKey}>
                <div
                  className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => toggleGroup(groupKey)}
                >
                  {isExpanded
                    ? <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    : <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                  }
                  <ActorChip actorId={group.firstItem.actor_id} actorType={group.firstItem.actor_type} compact />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${ENTITY_COLORS[group.entityType] ?? 'bg-muted text-muted-foreground'}`}
                      >
                        {formatEntityType(group.entityType)}
                      </Badge>
                      {group.firstItem.entity_label && !['created', 'deleted'].includes(headline.event_type) && (
                        <span className="text-xs font-medium text-muted-foreground truncate max-w-[160px]" title={group.firstItem.entity_label}>
                          {group.firstItem.entity_label}
                        </span>
                      )}
                      <span className={`text-sm ${headline.event_type === 'deleted' ? 'text-red-400' : 'text-foreground'}`}>
                        {formatActivityEvent(headline)}
                      </span>
                      {extraCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          +{extraCount} {isCreateWithFields ? (extraCount === 1 ? 'field set' : 'fields set') : (extraCount === 1 ? 'more change' : 'more changes')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDistanceToNow(new Date(group.latestItem.created_at), { addSuffix: true })}
                  </span>
                </div>

                {isExpanded && (
                  <div className="border-l-2 border-muted ml-6 space-y-1">
                    {group.items.map(entry => renderSingleEntry(entry))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-4">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>

    </div>
  )
}
