'use client'

import { useMemo, useState } from 'react'
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

interface ExperimentAProps {
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

const COLUMN_DEFS: {
  assigneeId: string
  name: string
  initials: string
  defaultDensity: Density
  defaultGroupBy: GroupBy
}[] = [
  {
    assigneeId: 'c8656fe5-6494-4255-a1b8-5485edef487a',
    name: 'Hunter',
    initials: 'HH',
    defaultDensity: 'card',
    defaultGroupBy: 'timeframe',
  },
  {
    assigneeId: '036b5f4a-a865-4b02-b54c-5d0628677d29',
    name: 'Frank',
    initials: 'FK',
    defaultDensity: 'thin',
    defaultGroupBy: 'status',
  },
  {
    assigneeId: '67046d50-74d3-42d7-8602-82c2044fb5d5',
    name: 'Lucy',
    initials: 'LW',
    defaultDensity: 'thin',
    defaultGroupBy: 'status',
  },
]

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
  name,
  initials,
  tasks,
  taskHref,
  recentlyChanged,
  defaultDensity,
  defaultGroupBy,
}: {
  name: string
  initials: string
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
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate">{name}</span>
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

export function ExperimentA({ tasks, taskHref, recentlyChanged }: ExperimentAProps) {
  return (
    <div className="flex w-full gap-0 divide-x" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Col 1 — Mantra */}
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

      {/* Cols 2-4 — Assignee columns */}
      {COLUMN_DEFS.map((col) => (
        <AssigneeColumn
          key={col.assigneeId}
          name={col.name}
          initials={col.initials}
          tasks={tasks.filter((t) => t.assignee_id === col.assigneeId)}
          taskHref={taskHref}
          recentlyChanged={recentlyChanged}
          defaultDensity={col.defaultDensity}
          defaultGroupBy={col.defaultGroupBy}
        />
      ))}
    </div>
  )
}
