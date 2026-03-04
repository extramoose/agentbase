'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
type Density = 'big' | 'card' | 'thin'
type GroupBy = 'timeframe' | 'status'

interface Task {
  id: string
  seq_id: number | null
  ticket_id: number
  title: string
  status: Status
  priority: Priority
  due_date: string | null
  tags: string[]
  assignee_id: string | null
  assignee_type: string | null
}

export interface ExperimentAProps {
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COL_MIN = 240
const COL_MAX = 800
const COL_DEFAULT_MANTRA = 480
const COL_DEFAULT_TASK = 440

function colWidthKey(actorId: string) { return `exp-a-width-${actorId}` }
function loadColWidth(actorId: string, def: number): number {
  if (typeof window === 'undefined') return def
  const v = localStorage.getItem(colWidthKey(actorId))
  return v ? Math.min(COL_MAX, Math.max(COL_MIN, Number(v))) : def
}
function saveColWidth(actorId: string, w: number) {
  try { localStorage.setItem(colWidthKey(actorId), String(w)) } catch {}
}


// ---------------------------------------------------------------------------
// useIsMobile
// ---------------------------------------------------------------------------
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// ---------------------------------------------------------------------------
// DragHandle
// ---------------------------------------------------------------------------

function DragHandle({ onResize }: { onResize: (dx: number) => void }) {
  const startX = useRef<number | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    startX.current = e.clientX
    const onMove = (ev: MouseEvent) => {
      if (startX.current === null) return
      onResize(ev.clientX - startX.current)
      startX.current = ev.clientX
    }
    const onUp = () => {
      startX.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onResize])

  return (
    <div
      onMouseDown={onMouseDown}
      className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-border/60 transition-colors select-none hidden sm:block"
    />
  )
}

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0, high: 1, medium: 2, low: 3, none: 4,
}

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-purple-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-400',
  none: 'bg-muted-foreground/30',
}

// Card border + bg styles (outlined, subtle fill)
const PRIORITY_CARD: Record<Priority, string> = {
  urgent: 'border-red-400 bg-red-500/5 dark:border-red-500/60 dark:bg-red-500/5',
  high:   'border-purple-400 bg-purple-500/5 dark:border-purple-500/60 dark:bg-purple-500/5',
  medium: 'border-blue-400 bg-blue-500/5 dark:border-blue-500/60 dark:bg-blue-500/5',
  low:    'border-slate-300 bg-slate-500/5 dark:border-slate-600 dark:bg-slate-500/5',
  none:   'border-border bg-transparent',
}

// Ticket number color in thin mode
const PRIORITY_TICKET_COLOR: Record<Priority, string> = {
  urgent: 'text-red-500',
  high:   'text-purple-500',
  medium: 'text-blue-500',
  low:    'text-slate-400',
  none:   'text-muted-foreground/60',
}

const DONE_LIMIT = 20
const DONE_FADE_START = 12 // fade begins at this index

// ---------------------------------------------------------------------------
// localStorage helpers (per actor)
// ---------------------------------------------------------------------------

function storageKey(actorId: string) {
  return `exp-a-col-${actorId}`
}

function loadColSettings(actorId: string, defaults: { density: Density; groupBy: GroupBy }) {
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(storageKey(actorId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      density: (parsed.density as Density) ?? defaults.density,
      groupBy: (parsed.groupBy as GroupBy) ?? defaults.groupBy,
    }
  } catch {
    return defaults
  }
}

function saveColSettings(actorId: string, settings: { density: Density; groupBy: GroupBy }) {
  try {
    localStorage.setItem(storageKey(actorId), JSON.stringify(settings))
  } catch {}
}

// ---------------------------------------------------------------------------
// Actor resolution hook
// ---------------------------------------------------------------------------

interface ResolvedActor {
  id: string
  fullName: string
  initials: string
  avatarUrl?: string | null
}

const actorNameCache = new Map<string, ResolvedActor>()

function useResolvedActors(
  assigneeIds: string[],
  assigneeTypes: Map<string, string | null>,
): Map<string, ResolvedActor> {
  const [resolved, setResolved] = useState<Map<string, ResolvedActor>>(() => {
    const initial = new Map<string, ResolvedActor>()
    for (const id of assigneeIds) {
      const cached = actorNameCache.get(id)
      if (cached) initial.set(id, cached)
    }
    return initial
  })

  const idsKey = assigneeIds.join(',')

  useEffect(() => {
    const missing = assigneeIds.filter((id) => !actorNameCache.has(id))
    if (missing.length === 0) return

    let cancelled = false
    const supabase = createClient()

    async function resolve() {
      const humanIds = missing.filter((id) => assigneeTypes.get(id) !== 'agent')
      const agentIds = missing.filter((id) => assigneeTypes.get(id) === 'agent')
      const results = new Map<string, ResolvedActor>()

      if (humanIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', humanIds)
        if (data) {
          for (const p of data) {
            const fullName = p.full_name ?? p.email?.split('@')[0] ?? 'Unknown'
            const initials = fullName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            const actor: ResolvedActor = { id: p.id, fullName, initials, avatarUrl: p.avatar_url ?? null }
            results.set(p.id, actor)
            actorNameCache.set(p.id, actor)
          }
        }
        const unresolvedHumans = humanIds.filter((id) => !results.has(id))
        if (unresolvedHumans.length > 0) {
          const { data: agents } = await supabase.from('agents').select('id, name, avatar_url').in('id', unresolvedHumans)
          if (agents) {
            for (const a of agents) {
              const fullName = a.name ?? 'Unknown'
              const initials = fullName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              const actor: ResolvedActor = { id: a.id, fullName, initials }
              results.set(a.id, actor)
              actorNameCache.set(a.id, actor)
            }
          }
        }
      }

      if (agentIds.length > 0) {
        const { data } = await supabase.from('agents').select('id, name, avatar_url').in('id', agentIds)
        if (data) {
          for (const a of data) {
            const fullName = a.name ?? 'Agent'
            const initials = fullName.split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
            const actor: ResolvedActor = { id: a.id, fullName, initials, avatarUrl: (a as {avatar_url?: string | null}).avatar_url ?? null }
            results.set(a.id, actor)
            actorNameCache.set(a.id, actor)
          }
        }
      }

      for (const id of missing) {
        if (!results.has(id)) {
          const fallback: ResolvedActor = { id, fullName: assigneeTypes.get(id) === 'agent' ? 'Agent' : 'Unknown', initials: '??' }
          actorNameCache.set(id, fallback)
          results.set(id, fallback)
        }
      }

      if (!cancelled) {
        setResolved((prev) => {
          const next = new Map(prev)
          for (const [k, v] of results) next.set(k, v)
          return next
        })
      }
    }

    resolve()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  return resolved
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr.slice(0, 10) + 'T00:00:00')
  const today = startOfToday()
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`
  if (diffDays <= 7) return `In ${diffDays}d`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

interface Group {
  key: string
  label: string
  tasks: Task[]
}

function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

function groupByTimeframe(tasks: Task[]): Group[] {
  // Exclude done/cancelled — they belong in history, not a timeframe view
  tasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')
  const today = startOfToday()
  const todayStr = localDateStr(today)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = localDateStr(tomorrow)
  const endOfWeek = new Date(today); endOfWeek.setDate(endOfWeek.getDate() + (7 - today.getDay()) % 7)
  const endOfWeekStr = localDateStr(endOfWeek)

  const buckets: Record<string, Task[]> = { past_due: [], today: [], tomorrow: [], this_week: [], later: [] }
  for (const task of tasks) {
    if (!task.due_date) { buckets.later.push(task); continue }
    const d = task.due_date.slice(0, 10)
    if (d < todayStr) buckets.past_due.push(task)
    else if (d === todayStr) buckets.today.push(task)
    else if (d === tomorrowStr) buckets.tomorrow.push(task)
    else if (d <= endOfWeekStr) buckets.this_week.push(task)
    else buckets.later.push(task)
  }

  return [
    { key: 'past_due', label: 'Past Due' },
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'this_week', label: 'This Week' },
    { key: 'later', label: 'Later' },
  ]
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({ ...g, tasks: sortByPriority(buckets[g.key]) }))
}

function groupByStatus(tasks: Task[]): Group[] {
  return [
    { key: 'in_progress', label: 'In Progress' },
    { key: 'todo', label: 'Todo' },
    { key: 'backlog', label: 'Backlog' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'done', label: 'Done' },
  ]
    .map((g) => ({ ...g, tasks: sortByPriority(tasks.filter((t) => t.status === g.key)) }))
    .filter((g) => g.tasks.length > 0)
}

// ---------------------------------------------------------------------------
// Task renderers
// ---------------------------------------------------------------------------

function TaskCard({ task, taskHref, highlight, forcedStyle }: { task: Task; taskHref: (task: Task) => string; highlight?: boolean; forcedStyle?: "gray" }) {
  return (
    <Link
      href={taskHref(task)}
      className={cn(
        'block rounded-lg border p-3 transition-colors cursor-pointer no-underline hover:brightness-95 dark:hover:brightness-110',
        forcedStyle === 'gray' ? 'border-border bg-transparent' : PRIORITY_CARD[task.priority],
        highlight && 'animate-sticky-pulse',
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', forcedStyle === "gray" ? "bg-muted-foreground/30" : PRIORITY_DOT[task.priority])} title={task.priority} />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm leading-snug line-clamp-2", forcedStyle === "gray" ? "font-normal text-muted-foreground" : "font-medium")}>{task.title}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              #{task.seq_id ?? task.ticket_id}
            </Badge>
            {task.due_date && (
              <span className="text-[10px] text-muted-foreground">{formatDueDate(task.due_date)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function TaskThinRow({ task, taskHref }: { task: Task; taskHref: (task: Task) => string }) {
  return (
    <Link
      href={taskHref(task)}
      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-accent/40 transition-colors cursor-pointer no-underline"
    >
      <span className={cn('text-xs w-10 shrink-0 text-right font-mono', PRIORITY_TICKET_COLOR[task.priority])}>
        #{task.seq_id ?? task.ticket_id}
      </span>
      <span className="text-sm truncate">{task.title}</span>
    </Link>
  )
}


function TaskBigCard({ task, taskHref, highlight, forcedStyle }: { task: Task; taskHref: (task: Task) => string; highlight?: boolean; forcedStyle?: "gray" }) {
  return (
    <Link
      href={taskHref(task)}
      className={cn(
        'flex flex-col justify-between rounded-xl border p-6 transition-colors cursor-pointer no-underline hover:brightness-95 dark:hover:brightness-110',
        forcedStyle === 'gray' ? 'border-border bg-transparent' : PRIORITY_CARD[task.priority],
        highlight && 'animate-sticky-pulse',
      )}
      style={{ height: '240px' }}
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-1 h-2.5 w-2.5 rounded-full shrink-0', forcedStyle === "gray" ? "bg-muted-foreground/30" : PRIORITY_DOT[task.priority])} title={task.priority} />
        <p className={cn("text-xl leading-snug line-clamp-4", forcedStyle === "gray" ? "font-normal text-muted-foreground" : "font-medium")}>{task.title}</p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          #{task.seq_id ?? task.ticket_id}
        </Badge>
        {task.due_date && (
          <span className="text-xs text-muted-foreground">{formatDueDate(task.due_date)}</span>
        )}
        {task.tags?.slice(0, 2).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs px-2 py-0.5">{tag}</Badge>
        ))}
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Group renderer with Done fade + limit
// ---------------------------------------------------------------------------

function GroupSection({
  group,
  density,
  taskHref,
  recentlyChanged,
}: {
  group: Group
  density: Density
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}) {
  const isDone = group.key === 'done'
  const displayTasks = isDone ? group.tasks.slice(0, DONE_LIMIT) : group.tasks

  return (
    <div className={cn(isDone && 'opacity-30 hover:opacity-100 transition-opacity duration-300')}>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm flex items-center gap-2 py-2.5 mb-2 border-b border-border/50 px-4">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
        <span className="text-xs text-muted-foreground/70">{group.tasks.length}{isDone && group.tasks.length > DONE_LIMIT ? ` (showing ${DONE_LIMIT})` : ''}</span>
      </div>
      <div className={cn('px-4', density === 'big' ? 'space-y-4' : density === 'card' ? 'space-y-2' : 'space-y-0.5')}>
        {displayTasks.map((task, i) => {
          const fadeIndex = isDone ? i - DONE_FADE_START : -1
          const opacity = fadeIndex > 0 ? Math.max(0, 1 - fadeIndex / (DONE_LIMIT - DONE_FADE_START)) : 1
          return (
            <div key={task.id} style={{ opacity }}>
              {density === 'big' ? (
                <TaskBigCard task={task} taskHref={taskHref} highlight={!isDone && (recentlyChanged?.has(task.id) ?? false)} forcedStyle={isDone ? 'gray' : undefined} />
              ) : density === 'card' ? (
                <TaskCard task={task} taskHref={taskHref} highlight={!isDone && (recentlyChanged?.has(task.id) ?? false)} forcedStyle={isDone ? 'gray' : undefined} />
              ) : (
                <TaskThinRow task={task} taskHref={taskHref} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AssigneeColumn
// ---------------------------------------------------------------------------

function AssigneeColumn({
  actor,
  tasks,
  taskHref,
  recentlyChanged,
  defaultDensity,
  defaultGroupBy,
  defaultWidth = COL_DEFAULT_TASK,
}: {
  actor: ResolvedActor
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
  defaultDensity: Density
  defaultGroupBy: GroupBy
  defaultWidth?: number
}) {
  const [width, setWidth] = useState(() => loadColWidth(actor.id, defaultWidth))
  const handleResize = useCallback((dx: number) => {
    setWidth((w) => {
      const next = Math.min(COL_MAX, Math.max(COL_MIN, w + dx))
      saveColWidth(actor.id, next)
      return next
    })
  }, [actor.id])

  const isMobile = useIsMobile()
  const saved = useMemo(() => loadColSettings(actor.id, { density: defaultDensity, groupBy: defaultGroupBy }), [actor.id, defaultDensity, defaultGroupBy])
  const [density, setDensityState] = useState<Density>(saved.density)
  const [groupBy, setGroupByState] = useState<GroupBy>(saved.groupBy)

  function setDensity(v: Density) {
    setDensityState(v)
    saveColSettings(actor.id, { density: v, groupBy })
  }
  function setGroupBy(v: GroupBy) {
    setGroupByState(v)
    saveColSettings(actor.id, { density, groupBy: v })
  }

  const groups = useMemo(
    () => (groupBy === 'timeframe' ? groupByTimeframe(tasks) : groupByStatus(tasks)),
    [tasks, groupBy],
  )

  return (
    <div className="relative flex flex-col shrink-0 border-r last:border-r-0 sm:w-auto w-[80vw] [scroll-snap-align:start] sm:[scroll-snap-align:none]" style={isMobile ? undefined : { width: `${width}px` }}>
      <DragHandle onResize={handleResize} />
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        <Avatar className="h-7 w-7">
          {actor.avatarUrl && <AvatarImage src={actor.avatarUrl} alt={actor.fullName} />}
          <AvatarFallback className="text-[10px]">{actor.initials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate">{actor.fullName}</span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Density</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
                <DropdownMenuRadioItem value="big">Big</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="card">Card</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="thin">Thin</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Group by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
                <DropdownMenuRadioItem value="timeframe">Timeframe</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrollable task list */}
      <div className="flex-1 overflow-y-auto pb-8 space-y-5">
        {groups.map((group) => (
          <GroupSection key={group.key} group={group} density={density} taskHref={taskHref} recentlyChanged={recentlyChanged} />
        ))}
        {/* Empty state: keep column shape, show nothing */}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MantraColumn (resizable)
// ---------------------------------------------------------------------------

function MantraColumn() {
  const isMobile = useIsMobile()
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return COL_DEFAULT_MANTRA
    // On mobile default to 80vw; on desktop use saved or 50%
    if (window.innerWidth < 640) return window.innerWidth * 0.8
    const saved = localStorage.getItem('exp-a-width-mantra')
    return saved ? Math.min(COL_MAX, Math.max(COL_MIN, Number(saved))) : Math.round(window.innerWidth * 0.5)
  })

  const handleResize = useCallback((dx: number) => {
    setWidth((w) => {
      const next = Math.min(COL_MAX, Math.max(COL_MIN, w + dx))
      try { localStorage.setItem('exp-a-width-mantra', String(next)) } catch {}
      return next
    })
  }, [])

  return (
    <div
      className="relative shrink-0 overflow-y-auto border-r flex flex-col w-[80vw] sm:w-auto [scroll-snap-align:start] sm:[scroll-snap-align:none]"
      style={isMobile ? undefined : { width }}
    >
      <DragHandle onResize={handleResize} />
      <div className="px-10 py-12 flex flex-col gap-8">
        <span className="text-xs uppercase tracking-widest text-muted-foreground/60">Mantra</span>
        <p className="text-3xl font-light text-muted-foreground/50 leading-[1.6]">
          Focus on what matters.<br />Ship small. Iterate fast.<br /><br />
          Every line of code is a liability — keep it lean, keep it clear, keep it moving.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExperimentA
// ---------------------------------------------------------------------------

interface DerivedAssignee {
  id: string
  type: 'human' | 'agent'
}

export function ExperimentA({ tasks, taskHref, recentlyChanged }: ExperimentAProps) {
  const { humans, agents, assigneeTypes } = useMemo(() => {
    const seen = new Map<string, DerivedAssignee>()
    const typeMap = new Map<string, string | null>()
    for (const t of tasks) {
      if (t.assignee_id && !seen.has(t.assignee_id)) {
        const role = t.assignee_type === 'agent' ? 'agent' as const : 'human' as const
        seen.set(t.assignee_id, { id: t.assignee_id, type: role })
        typeMap.set(t.assignee_id, t.assignee_type)
      }
    }
    const all = Array.from(seen.values())
    return { humans: all.filter((a) => a.type === 'human'), agents: all.filter((a) => a.type === 'agent'), assigneeTypes: typeMap }
  }, [tasks])

  const allIds = useMemo(() => [...humans, ...agents].map((a) => a.id), [humans, agents])
  const actorMap = useResolvedActors(allIds, assigneeTypes)

  return (
    <div className="flex gap-0 overflow-x-auto border-t [scroll-snap-type:x_mandatory] sm:[scroll-snap-type:none]" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Set 1 — Mantra */}
      <MantraColumn />

      {/* Set 2 — Human columns */}
      {humans.map((h) => (
        <AssigneeColumn
          key={h.id}
          actor={actorMap.get(h.id) ?? { id: h.id, fullName: '...', initials: '??' }}
          tasks={tasks.filter((t) => t.assignee_id === h.id)}
          taskHref={taskHref}
          recentlyChanged={recentlyChanged}
          defaultDensity="card"
          defaultGroupBy="timeframe"
        />
      ))}

      {/* Set 3 — Agent columns */}
      {agents.map((a) => (
        <AssigneeColumn
          key={a.id}
          actor={actorMap.get(a.id) ?? { id: a.id, fullName: '...', initials: '??' }}
          tasks={tasks.filter((t) => t.assignee_id === a.id)}
          taskHref={taskHref}
          recentlyChanged={recentlyChanged}
          defaultDensity="thin"
          defaultGroupBy="status"
        />
      ))}
    </div>
  )
}
