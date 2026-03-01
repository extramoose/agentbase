'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow, isToday, isYesterday, format, addDays } from 'date-fns'
import { ChevronLeft, ChevronRight, Loader2, Plus, Minus } from 'lucide-react'
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

function buildBurstSummary(burst: SessionBurst): string[] {
  const counts = new Map<string, number>()
  for (const group of burst.groups) {
    for (const entry of group.entries) {
      const verb = formatEventVerb(entry.event_type)
      const entityLabel = normalizeEntityType(entry.entity_type).replace(/_/g, ' ')
      const key = `${verb}\0${entityLabel}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const [verb, entityLabel] = key.split('\0')
      return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${count} ${entityLabel}`
    })
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

function formatDateLabel(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMMM d, yyyy')
}

interface HistoryClientProps {
  initialEntries: ActivityLogEntry[]
}

const USER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
  // Format date as YYYY-MM-DD in local timezone (not UTC)
  const localDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`


export function HistoryClient({ initialEntries }: HistoryClientProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>(initialEntries)
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const supabase = createClient()

  // Inline shelf state
  const [shelfData, setShelfData] = useState<{
    entity: BaseEntity
    entityType: EntityType
    label: string
  } | null>(null)

  // Expand/collapse state for consecutive event groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Infinite scroll refs
  const hasMoreRef = useRef<boolean>(true)
  const loadingRef = useRef<boolean>(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef<number>(initialEntries.length)

  // seq_id cache: entity UUID → seq_id (number)
  const seqIdCache = useRef<Map<string, number>>(new Map())
  const [seqIdMap, setSeqIdMap] = useState<Map<string, number>>(new Map())


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

  // Re-fetch when filter, search, or selected date changes
  useEffect(() => {
    let cancelled = false
    const reload = async () => {
      setLoading(true)
      const day = localDateStr(selectedDate)
      const { data } = await supabase.rpc('get_activity_log', {
        p_limit: 50,
        p_offset: 0,
        p_date_from: day,
        p_date_to: day,
        p_tz: USER_TZ,
        ...(entityFilter ? { p_entity_type: entityFilter } : {}),
        ...(search.trim() ? { p_search: search.trim() } : {}),
      })
      if (cancelled) return
      const results = (data ?? []) as ActivityLogEntry[]
      await resolveSeqIds(results)
      setEntries(results)
      offsetRef.current = results.length
      hasMoreRef.current = results.length >= 50
      setLoading(false)
    }
    const timeout = setTimeout(reload, search.trim() ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [entityFilter, search, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  

  // Load next page of events within the same selected day
  const loadMore = useCallback(async () => {
    console.log('[history] loadMore called, offset:', offsetRef.current, 'hasMore:', hasMoreRef.current)
    if (!hasMoreRef.current || loadingRef.current) return
    loadingRef.current = true
    const day = localDateStr(selectedDate)
    const { data } = await supabase.rpc('get_activity_log', {
      p_limit: 50,
      p_offset: offsetRef.current,
      p_date_from: day,
      p_date_to: day,
      p_tz: USER_TZ,
      ...(entityFilter ? { p_entity_type: entityFilter } : {}),
      ...(search.trim() ? { p_search: search.trim() } : {}),
    })
    const results = (data ?? []) as ActivityLogEntry[]
    if (results.length < 50) hasMoreRef.current = false
    if (results.length > 0) {
      offsetRef.current += results.length
      await resolveSeqIds(results)
      setEntries(prev => [...prev, ...results])
    }
    loadingRef.current = false
  }, [selectedDate, entityFilter, search, supabase, resolveSeqIds])

  // Scroll listener on the shell's <main> scroll container
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    // Find the nearest scrollable ancestor (the shell <main>)
    const scrollParent = sentinel.closest('main') ?? document.querySelector('main')
    if (!scrollParent) return
    const handleScroll = () => {
      const rect = sentinel.getBoundingClientRect()
      const containerRect = scrollParent.getBoundingClientRect()
      if (rect.top < containerRect.bottom + 200) {
        loadMore()
      }
    }
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [loadMore])

  // Filter to selected day, then two-pass grouping
  const displayItems = useMemo(() => {
    return groupSessionBursts(groupConsecutiveEvents(filterActivityItems(entries)))
  }, [entries])

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
        className={`flex items-start gap-3 rounded-lg px-3 py-3 ml-7 hover:bg-muted/40 transition-colors${isClickable ? ' cursor-pointer' : ''}`}
        onClick={isClickable ? () => handleEntityClick(entry) : undefined}
      >
        <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} compact />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} nameOnly />
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
          </div>
          <p className={`text-sm mt-0.5 ${isDeleted ? 'text-red-400' : 'text-muted-foreground'}`}>
            {formatActivityEvent(entry)}
          </p>
          {entry.event_type === 'commented' && entry.body && (
            <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <MarkdownRenderer content={entry.body} />
            </div>
          )}
        </div>
        <span suppressHydrationWarning className="text-xs text-muted-foreground/50 shrink-0 ml-2 mt-0.5">
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
          {isExpanded
            ? <Minus className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Collapse" />
            : <Plus className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Expand" />}
          <ActorChip actorId={group.actorId} actorType={group.actorType} compact />
          <div className="flex-1 min-w-0">
            <ActorChip actorId={group.actorId} actorType={group.actorType} nameOnly />
            <p className="text-sm text-muted-foreground mt-0.5">
              {formatEventVerb(group.eventType)}{' '}
              <span className="font-medium">{group.entries.length}</span>{' '}
              {entityLabel}
            </p>
          </div>
          <span suppressHydrationWarning className="text-xs text-muted-foreground/50 shrink-0 ml-auto">
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

  function renderBurst(burst: SessionBurst) {
    const isBurstExpanded = expandedGroups.has(burst.id)
    const summary = buildBurstSummary(burst)
    return (
      <div key={burst.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleGroup(burst.id)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(burst.id) } }}
          className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
        >
          {isBurstExpanded
            ? <Minus className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" aria-label="Collapse" />
            : <Plus className="h-5 w-5 shrink-0 mt-0.5 text-muted-foreground" aria-label="Expand" />}
          <ActorChip actorId={burst.actorId} actorType={burst.actorType} compact />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <ActorChip actorId={burst.actorId} actorType={burst.actorType} nameOnly />
              <span className="text-sm text-muted-foreground">
                made <span className="font-medium">{burst.totalEntries}</span> changes
              </span>
              <span suppressHydrationWarning className="text-xs text-muted-foreground/50 ml-auto shrink-0">
                {formatDistanceToNow(new Date(burst.groups[0].entries[0].created_at), { addSuffix: true })}
              </span>
            </div>
            {!isBurstExpanded && (
              <ul className="mt-1.5 space-y-0.5">
                {summary.map(line => (
                  <li key={line} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {isBurstExpanded && (
          <div className="space-y-1 ml-4 border-l border-border pl-2">
            {burst.groups.map(group => renderLevel1Group(group))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold shrink-0">History</h1>
        <div className="flex items-center gap-2">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search activity..."
          >
            <button
              onClick={() => setEntityFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                entityFilter === null
                  ? 'bg-white text-black border border-black'
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
                    ? 'bg-white text-black border border-black'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {formatEntityType(type)}
              </button>
            ))}
          </SearchFilterBar>
        </div>
      </div>

      {/* Day navigation */}
      <div className="flex items-center justify-between px-3 py-2 mb-4 bg-muted/50 rounded-lg">
        <button
          onClick={() => setSelectedDate(d => addDays(d, -1))}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span suppressHydrationWarning className="text-sm font-medium">
          {formatDateLabel(selectedDate)}
        </span>
        <button
          onClick={() => setSelectedDate(d => addDays(d, 1))}
          disabled={isToday(selectedDate)}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next day"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Activity list */}
      <div ref={scrollContainerRef} className="space-y-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : displayItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No activity for this day.
          </p>
        ) : (
          <>
            {displayItems.map(item =>
              item.type === 'flat'
                ? renderLevel1Group(item.group)
                : renderBurst(item)
            )}
            <div ref={sentinelRef} className="h-10 bg-red-500 text-white text-center">SENTINEL - if you see this, scroll works</div>
          </>
        )}
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
