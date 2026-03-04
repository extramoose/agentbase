'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

type Density = 'card' | 'thin'
type GroupBy = 'timeframe' | 'status'

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-slate-400',
  none: 'bg-muted-foreground/40',
}

// ---------------------------------------------------------------------------
// Actor resolution hook
// ---------------------------------------------------------------------------

interface ResolvedActor {
  id: string
  fullName: string
  initials: string
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
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', humanIds)
        if (data) {
          for (const p of data) {
            const fullName = p.full_name ?? p.email?.split('@')[0] ?? 'Unknown'
            const initials = fullName
              .split(/\s+/)
              .map((w: string) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
            const actor: ResolvedActor = { id: p.id, fullName, initials }
            results.set(p.id, actor)
            actorNameCache.set(p.id, actor)
          }
        }
        // Any humanIds not found in profiles — try agents table as fallback
        const unresolvedHumans = humanIds.filter((id) => !results.has(id))
        if (unresolvedHumans.length > 0) {
          const { data: agents } = await supabase
            .from('agents')
            .select('id, name')
            .in('id', unresolvedHumans)
          if (agents) {
            for (const a of agents) {
              const fullName = a.name ?? 'Unknown'
              const initials = fullName
                .split(/\s+/)
                .map((w: string) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              const actor: ResolvedActor = { id: a.id, fullName, initials }
              results.set(a.id, actor)
              actorNameCache.set(a.id, actor)
            }
          }
        }
      }

      if (agentIds.length > 0) {
        const { data } = await supabase
          .from('agents')
          .select('id, name')
          .in('id', agentIds)
        if (data) {
          for (const a of data) {
            const fullName = a.name ?? 'Agent'
            const initials = fullName
              .split(/\s+/)
              .map((w: string) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
            const actor: ResolvedActor = { id: a.id, fullName, initials }
            results.set(a.id, actor)
            actorNameCache.set(a.id, actor)
          }
        }
      }

      // Fallback for any still-unresolved
      for (const id of missing) {
        if (!results.has(id)) {
          const fallback: ResolvedActor = {
            id,
            fullName: assigneeTypes.get(id) === 'agent' ? 'Agent' : 'Unknown',
            initials: '??',
          }
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
    return () => {
      cancelled = true
    }
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
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr.slice(0, 10) + 'T00:00:00')
  const today = startOfToday()
  const diffMs = date.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

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
  return [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  )
}

function groupByTimeframe(tasks: Task[]): Group[] {
  const today = startOfToday()
  const todayStr = localDateStr(today)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = localDateStr(tomorrow)

  const daysUntilSunday = (7 - today.getDay()) % 7
  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday)
  const endOfWeekStr = localDateStr(endOfWeek)

  const buckets: Record<string, Task[]> = {
    past_due: [],
    today: [],
    tomorrow: [],
    this_week: [],
    later: [],
  }

  for (const task of tasks) {
    if (!task.due_date) {
      buckets.later.push(task)
      continue
    }
    const d = task.due_date.slice(0, 10)
    if (d < todayStr) buckets.past_due.push(task)
    else if (d === todayStr) buckets.today.push(task)
    else if (d === tomorrowStr) buckets.tomorrow.push(task)
    else if (d <= endOfWeekStr) buckets.this_week.push(task)
    else buckets.later.push(task)
  }

  const order: { key: string; label: string }[] = [
    { key: 'past_due', label: 'Past Due' },
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'this_week', label: 'This Week' },
    { key: 'later', label: 'Later' },
  ]

  return order
    .filter((g) => buckets[g.key].length > 0)
    .map((g) => ({ key: g.key, label: g.label, tasks: sortByPriority(buckets[g.key]) }))
}

function groupByStatus(tasks: Task[]): Group[] {
  const order: { key: Status; label: string }[] = [
    { key: 'in_progress', label: 'In Progress' },
    { key: 'todo', label: 'Todo' },
    { key: 'backlog', label: 'Backlog' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'done', label: 'Done' },
  ]

  return order
    .map((g) => ({
      key: g.key,
      label: g.label,
      tasks: sortByPriority(tasks.filter((t) => t.status === g.key)),
    }))
    .filter((g) => g.tasks.length > 0)
}

// ---------------------------------------------------------------------------
// Task renderers
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  taskHref,
  highlight,
}: {
  task: Task
  taskHref: (task: Task) => string
  highlight?: boolean
}) {
  return (
    <Link
      href={taskHref(task)}
      className={cn(
        'block rounded-lg border p-3 hover:bg-accent/40 transition-colors cursor-pointer no-underline',
        highlight && 'animate-sticky-pulse',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', PRIORITY_DOT[task.priority])}
          title={task.priority}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug line-clamp-2">{task.title}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              #{task.seq_id ?? task.ticket_id}
            </Badge>
            {task.due_date && (
              <span className="text-[10px] text-muted-foreground">
                {formatDueDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function TaskThinRow({
  task,
  taskHref,
}: {
  task: Task
  taskHref: (task: Task) => string
}) {
  return (
    <Link
      href={taskHref(task)}
      className="flex items-center gap-2 py-1 px-1 rounded hover:bg-accent/40 transition-colors cursor-pointer no-underline"
    >
      <span className="text-muted-foreground text-xs w-10 shrink-0 text-right">
        #{task.seq_id ?? task.ticket_id}
      </span>
      <span className="text-sm truncate">{task.title}</span>
    </Link>
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
}: {
  actor: ResolvedActor
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
  defaultDensity: Density
  defaultGroupBy: GroupBy
}) {
  const [density, setDensity] = useState<Density>(defaultDensity)
  const [groupBy, setGroupBy] = useState<GroupBy>(defaultGroupBy)

  const groups = useMemo(
    () => (groupBy === 'timeframe' ? groupByTimeframe(tasks) : groupByStatus(tasks)),
    [tasks, groupBy],
  )

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Avatar size="sm">
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
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {group.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {group.tasks.length}
              </span>
            </div>
            <div className={cn(density === 'card' ? 'space-y-2' : 'space-y-0.5')}>
              {group.tasks.map((task) =>
                density === 'card' ? (
                  <TaskCard
                    key={task.id}
                    task={task}
                    taskHref={taskHref}
                    highlight={recentlyChanged?.has(task.id)}
                  />
                ) : (
                  <TaskThinRow key={task.id} task={task} taskHref={taskHref} />
                ),
              )}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No tasks</p>
        )}
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
  // Derive unique assignees from tasks, split by role
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
    return {
      humans: all.filter((a) => a.type === 'human'),
      agents: all.filter((a) => a.type === 'agent'),
      assigneeTypes: typeMap,
    }
  }, [tasks])

  const allIds = useMemo(
    () => [...humans, ...agents].map((a) => a.id),
    [humans, agents],
  )

  const actorMap = useResolvedActors(allIds, assigneeTypes)

  return (
    <div className="flex w-full gap-0 divide-x" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Set 1 — Mantra */}
      <div
        className="shrink-0 overflow-y-auto px-6 py-6 flex flex-col"
        style={{ width: 220 }}
      >
        <span className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
          Mantra
        </span>
        <p className="text-2xl font-light text-muted-foreground/60 leading-relaxed">
          Focus on what matters. Ship small. Iterate fast. Every line of code is a
          liability — keep it lean, keep it clear, keep it moving.
        </p>
      </div>

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
