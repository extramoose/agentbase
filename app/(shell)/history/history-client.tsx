'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Loader2 } from 'lucide-react'
import {
  formatActivityEvent,
  filterActivityItems,
  type ActivityLogEntry,
} from '@/lib/format-activity'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { type BaseEntity, type EntityType } from '@/types/entities'

/** Maps entity_type (table name) to the front-end path prefix */
function getEntityPath(entityType: string): string {
  switch (normalizeEntityType(entityType)) {
    case 'tasks':         return '/tools/tasks'
    case 'library_items': return '/tools/library'
    case 'companies':     return '/tools/crm/companies'
    case 'people':        return '/tools/crm/people'
    case 'deals':         return '/tools/crm/deals'
    default:              return ''
  }
}

/**
 * Normalize entity_type values — handles both table name format (tasks,
 * library_items) and legacy singular/hyphenated format written by older
 * delete-entity / batch-update routes before the fix.
 */
function normalizeEntityType(raw: string): string {
  const map: Record<string, string> = {
    task: 'tasks',
    'library-item': 'library_items',
    'library-items': 'library_items',
    company: 'companies',
    companie: 'companies', // legacy bug
    person: 'people',
    deal: 'deals',
  }
  return map[raw] ?? raw
}

const ENTITY_COLORS: Record<string, string> = {
  tasks:          'bg-blue-500/20 text-blue-400',
  library_items:  'bg-yellow-500/20 text-yellow-400',
  companies:      'bg-red-500/20 text-red-400',
  people:         'bg-pink-500/20 text-pink-400',
  deals:          'bg-emerald-500/20 text-emerald-400',
}

const ENTITY_TYPES = [
  'tasks', 'library_items',
  'companies', 'people', 'deals',
] as const

function formatEntityType(type: string): string {
  const normalized = normalizeEntityType(type)
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const ENTITY_TYPE_SINGULAR: Record<string, string> = {
  tasks: 'Task',
  library_items: 'Item',
  companies: 'Company',
  people: 'Person',
  deals: 'Deal',
}

function formatEntityBadge(type: string, seqId: number | undefined): string {
  const normalized = normalizeEntityType(type)
  const singular = ENTITY_TYPE_SINGULAR[normalized] ?? formatEntityType(type)
  return seqId != null ? `${singular} #${seqId}` : singular
}

const TABLE_TO_ENTITY_TYPE: Record<string, EntityType> = {
  tasks: 'task',
  library_items: 'library_item',
  people: 'person',
  companies: 'company',
  deals: 'deal',
}

// ---------------------------------------------------------------------------
// Consecutive event grouping — same actor + event type + entity type within 5 min
// ---------------------------------------------------------------------------

interface ConsecutiveEventGroup {
  id: string
  entries: ActivityLogEntry[]
  actorId: string
  actorType: 'human' | 'agent'
  eventType: string
  entityType: string // normalized
}

function groupConsecutiveEvents(entries: ActivityLogEntry[]): ConsecutiveEventGroup[] {
  const result: ConsecutiveEventGroup[] = []
  for (const entry of entries) {
    const normalized = normalizeEntityType(entry.entity_type)
    const last = result[result.length - 1]
    if (
      last &&
      last.actorId === entry.actor_id &&
      last.eventType === entry.event_type &&
      last.entityType === normalized &&
      Math.abs(
        new Date(last.entries[last.entries.length - 1].created_at).getTime() -
        new Date(entry.created_at).getTime()
      ) <= 5 * 60 * 1000
    ) {
      last.entries.push(entry)
    } else {
      result.push({
        id: entry.id,
        entries: [entry],
        actorId: entry.actor_id,
        actorType: entry.actor_type,
        eventType: entry.event_type,
        entityType: normalized,
      })
    }
  }
  return result
}

function formatEventVerb(eventType: string): string {
  switch (eventType) {
    case 'created':          return 'created'
    case 'deleted':          return 'deleted'
    case 'updated':          return 'updated'
    case 'status_changed':   return 'changed status on'
    case 'priority_changed': return 'changed priority on'
    case 'assignee_changed': return 'reassigned'
    case 'commented':        return 'commented on'
    case 'field_updated':    return 'updated'
    case 'title_changed':    return 'renamed'
    case 'due_date_set':     return 'set due date on'
    case 'due_date_cleared': return 'cleared due date on'
    case 'tags_changed':     return 'changed tags on'
    default:                 return eventType.replace(/_/g, ' ')
  }
}

interface HistoryClientProps {
  initialEntries: ActivityLogEntry[]
}

export function HistoryClient({ initialEntries }: HistoryClientProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Inline shelf state
  const [shelfData, setShelfData] = useState<{
    entity: BaseEntity
    entityType: EntityType
    label: string
  } | null>(null)

  // Expand/collapse state for consecutive event groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // seq_id cache: entity UUID → seq_id (number)
  const seqIdCache = useRef<Map<string, number>>(new Map())
  const [seqIdMap, setSeqIdMap] = useState<Map<string, number>>(new Map())

  // Refs to decouple loadMore identity from rapidly-changing state.
  const loadingRef = useRef(false)
  const hasMoreRef = useRef(initialEntries.length >= 50)
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  /**
   * Resolve seq_ids for a batch of activity log entries.
   * Only fetches IDs not already in the cache.
   */
  const resolveSeqIds = useCallback(async (entriesToResolve: ActivityLogEntry[]) => {
    const byTable = new Map<string, string[]>()
    for (const entry of entriesToResolve) {
      if (seqIdCache.current.has(entry.entity_id)) continue
      if (entry.event_type === 'deleted') continue // entity no longer exists
      const table = normalizeEntityType(entry.entity_type)
      if (!(ENTITY_TYPES as readonly string[]).includes(table)) continue
      const ids = byTable.get(table) ?? []
      if (!ids.includes(entry.entity_id)) ids.push(entry.entity_id)
      byTable.set(table, ids)
    }

    if (byTable.size === 0) return

    for (const [table, ids] of byTable) {
      const { data } = await supabase.from(table).select('id, seq_id').in('id', ids)
      if (data) {
        for (const row of data as { id: string; seq_id: number | null }[]) {
          if (row.seq_id != null) seqIdCache.current.set(row.id, row.seq_id)
        }
      }
    }
    setSeqIdMap(new Map(seqIdCache.current))
  }, [supabase])

  // Resolve seq_ids for initial entries
  useEffect(() => {
    resolveSeqIds(initialEntries)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    resolveSeqIds(newEntries)
  }, [entityFilter, search, supabase, resolveSeqIds])

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
      resolveSeqIds(results)
    }
    const timeout = setTimeout(reload, search.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [entityFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

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
          resolveSeqIds([newEntry])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, resolveSeqIds])

  // Group consecutive same-actor/event/entity-type entries (within 5 min)
  const eventGroups = useMemo(
    () => groupConsecutiveEvents(filterActivityItems(entries)),
    [entries]
  )

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const openShelf = useCallback(async (entityId: string, entityType: string) => {
    const normalized = normalizeEntityType(entityType)
    const mappedType = TABLE_TO_ENTITY_TYPE[normalized]
    if (!mappedType) return
    const { data } = await supabase.from(normalized).select('*').eq('id', entityId).single()
    if (!data) return
    const entity = data as BaseEntity
    const label = (data as Record<string, unknown>).title as string
      ?? (data as Record<string, unknown>).name as string
      ?? ''
    setShelfData({ entity, entityType: mappedType, label })
  }, [supabase])

  function handleEntityClick(entry: ActivityLogEntry) {
    const normalized = normalizeEntityType(entry.entity_type)
    if (!getEntityPath(normalized)) return
    const seqId = seqIdMap.get(entry.entity_id)
    if (seqId == null) return
    openShelf(entry.entity_id, entry.entity_type)
  }

  function renderSingleEntry(entry: ActivityLogEntry) {
    const isDeleted = entry.event_type === 'deleted'
    const normalized = normalizeEntityType(entry.entity_type)
    const path = getEntityPath(normalized)
    const seqId = seqIdMap.get(entry.entity_id)
    const isClickable = !!path && !isDeleted && seqId != null
    return (
      <div
        key={entry.id}
        className={`flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors${isClickable ? ' cursor-pointer' : ''}`}
        onClick={isClickable ? () => handleEntityClick(entry) : undefined}
      >
        <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} compact />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${ENTITY_COLORS[normalized] ?? 'bg-muted text-muted-foreground'}`}
            >
              {formatEntityBadge(entry.entity_type, seqId)}
            </Badge>
            {entry.entity_label && !['created', 'deleted'].includes(entry.event_type) && (
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[200px]" title={entry.entity_label}>
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
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">History</h1>

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
        {eventGroups.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity found.
          </p>
        ) : (
          eventGroups.map(group => {
            if (group.entries.length === 1) {
              return renderSingleEntry(group.entries[0])
            }
            const isExpanded = expandedGroups.has(group.id)
            const entityLabel = group.entityType.replace(/_/g, ' ')
            return (
              <div key={group.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(group.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(group.id) } }}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
                >
                  <ActorChip actorId={group.actorId} actorType={group.actorType} />
                  <span className="text-sm flex-1 min-w-0">
                    {formatEventVerb(group.eventType)}{' '}
                    <span className="font-medium">{group.entries.length}</span>{' '}
                    {entityLabel}
                  </span>
                  <span className="text-xs text-muted-foreground" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDistanceToNow(new Date(group.entries[0].created_at), { addSuffix: true })}
                  </span>
                </div>
                {isExpanded && (
                  <div className="space-y-1 ml-4 border-l border-border pl-2">
                    {group.entries.map(entry => renderSingleEntry(entry))}
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

      {/* Inline entity shelf */}
      {shelfData && (
        <EntityShelf
          entity={shelfData.entity}
          entityType={shelfData.entityType}
          onClose={() => setShelfData(null)}
          title={shelfData.label}
        >
          <HistoryShelfContent entity={shelfData.entity} entityType={shelfData.entityType} />
        </EntityShelf>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minimal read-only shelf content for entities opened from history
// ---------------------------------------------------------------------------

function HistoryShelfContent({
  entity,
  entityType,
}: {
  entity: BaseEntity
  entityType: EntityType
}) {
  const data = entity as unknown as Record<string, unknown>

  const fields: { label: string; value: string }[] = []
  if (data.title) fields.push({ label: 'Title', value: String(data.title) })
  if (data.name) fields.push({ label: 'Name', value: String(data.name) })
  if (data.status) fields.push({ label: 'Status', value: String(data.status).replace(/_/g, ' ') })
  if (data.priority && data.priority !== 'none') fields.push({ label: 'Priority', value: String(data.priority) })
  if (data.email) fields.push({ label: 'Email', value: String(data.email) })
  if (data.phone) fields.push({ label: 'Phone', value: String(data.phone) })
  if (data.domain) fields.push({ label: 'Domain', value: String(data.domain) })
  if (data.industry) fields.push({ label: 'Industry', value: String(data.industry) })
  if (data.value != null && entityType === 'deal') fields.push({ label: 'Value', value: `$${Number(data.value).toLocaleString()}` })
  if (data.url) fields.push({ label: 'URL', value: String(data.url) })

  const bodyText = (data.body ?? data.notes ?? '') as string

  return (
    <div className="space-y-4">
      {fields.map(({ label, value }) => (
        <div key={label}>
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
          <p className="text-sm mt-0.5">{value}</p>
        </div>
      ))}
      {bodyText && (
        <div>
          <span className="text-xs text-muted-foreground font-medium">
            {data.notes ? 'Notes' : 'Description'}
          </span>
          <div className="mt-1 text-sm text-muted-foreground">
            <MarkdownRenderer content={bodyText} />
          </div>
        </div>
      )}
      {(entity.tags ?? []).length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground font-medium">Tags</span>
          <div className="flex gap-1 flex-wrap mt-1">
            {entity.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
