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
import { type BaseEntity, type EntityType, ENTITY_TABLE } from '@/types/entities'
import { toast } from '@/hooks/use-toast'
import { TaskShelfContent, type Task } from '@/app/(shell)/tools/tasks/tasks-client'
import {
  DealShelfContent,
  CompanyShelfContent,
  PersonShelfContent,
  type CrmDeal,
  type CrmCompany,
  type CrmPerson,
} from '@/app/(shell)/tools/crm/crm-client'
import { LibraryShelfContent, type LibraryItem } from '@/app/(shell)/tools/library/library-client'

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

// ---------------------------------------------------------------------------
// Level 2 "session burst" grouping — same actor, 6+ actions within 20 min
// ---------------------------------------------------------------------------

interface SessionBurst {
  type: 'burst'
  id: string
  actorId: string
  actorType: 'human' | 'agent'
  groups: ConsecutiveEventGroup[]
  totalEntries: number
}

interface FlatGroup {
  type: 'flat'
  group: ConsecutiveEventGroup
}

type DisplayItem = SessionBurst | FlatGroup

function groupSessionBursts(groups: ConsecutiveEventGroup[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let run: ConsecutiveEventGroup[] = []
  let runEntryCount = 0

  function flushRun() {
    if (run.length === 0) return
    if (runEntryCount >= 6) {
      result.push({
        type: 'burst',
        id: `burst-${run[0].id}`,
        actorId: run[0].actorId,
        actorType: run[0].actorType,
        groups: run,
        totalEntries: runEntryCount,
      })
    } else {
      for (const g of run) {
        result.push({ type: 'flat', group: g })
      }
    }
    run = []
    runEntryCount = 0
  }

  for (const group of groups) {
    if (run.length === 0) {
      run.push(group)
      runEntryCount = group.entries.length
      continue
    }

    const sameActor = group.actorId === run[0].actorId
    const runStart = new Date(run[0].entries[0].created_at).getTime()
    const groupEnd = new Date(group.entries[group.entries.length - 1].created_at).getTime()
    const withinWindow = Math.abs(runStart - groupEnd) <= 20 * 60 * 1000

    if (sameActor && withinWindow) {
      run.push(group)
      runEntryCount += group.entries.length
    } else {
      flushRun()
      run.push(group)
      runEntryCount = group.entries.length
    }
  }

  flushRun()
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

  // Two-pass grouping: Level 1 (consecutive events) → Level 2 (session bursts)
  const displayItems = useMemo(
    () => groupSessionBursts(groupConsecutiveEvents(filterActivityItems(entries))),
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

  const handleEntityUpdate = useCallback(
    async (id: string, table: string, fields: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, id, fields }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch (err) {
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Update failed',
        })
      }
    },
    [],
  )

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
        <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} />
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

  function renderLevel1Group(group: ConsecutiveEventGroup) {
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
        {displayItems.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity found.
          </p>
        ) : (
          displayItems.map(item => {
            if (item.type === 'flat') {
              return renderLevel1Group(item.group)
            }
            // Session burst (Level 2)
            const burst = item
            const isBurstExpanded = expandedGroups.has(burst.id)
            return (
              <div key={burst.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleGroup(burst.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(burst.id) } }}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
                >
                  <ActorChip actorId={burst.actorId} actorType={burst.actorType} />
                  <span className="text-sm flex-1 min-w-0">
                    made <span className="font-medium">{burst.totalEntries}</span> changes
                  </span>
                  <span className="text-xs text-muted-foreground" aria-label={isBurstExpanded ? 'Collapse' : 'Expand'}>
                    {isBurstExpanded ? '▾' : '▸'}
                  </span>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDistanceToNow(new Date(burst.groups[0].entries[0].created_at), { addSuffix: true })}
                  </span>
                </div>
                {isBurstExpanded && (
                  <div className="space-y-1 ml-4 border-l border-border pl-2">
                    {burst.groups.map(group => renderLevel1Group(group))}
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
          {shelfData.entityType === 'task' && (
            <TaskShelfContent
              task={shelfData.entity as Task}
              onClose={() => setShelfData(null)}
            />
          )}
          {shelfData.entityType === 'deal' && (
            <DealShelfContent
              deal={shelfData.entity as CrmDeal}
              onUpdate={(fields) =>
                handleEntityUpdate(shelfData.entity.id, ENTITY_TABLE[shelfData.entityType], fields)
              }
            />
          )}
          {shelfData.entityType === 'company' && (
            <CompanyShelfContent
              company={shelfData.entity as CrmCompany}
              onUpdate={(fields) =>
                handleEntityUpdate(shelfData.entity.id, ENTITY_TABLE[shelfData.entityType], fields)
              }
            />
          )}
          {shelfData.entityType === 'person' && (
            <PersonShelfContent
              person={shelfData.entity as CrmPerson}
              onUpdate={(fields) =>
                handleEntityUpdate(shelfData.entity.id, ENTITY_TABLE[shelfData.entityType], fields)
              }
            />
          )}
          {shelfData.entityType === 'library_item' && (
            <LibraryShelfContent
              item={shelfData.entity as LibraryItem}
              onUpdate={(id, fields) =>
                handleEntityUpdate(id, ENTITY_TABLE[shelfData.entityType], fields)
              }
            />
          )}
        </EntityShelf>
      )}
    </div>
  )
}
