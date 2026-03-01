'use client'

import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

interface StickyTask {
  id: string
  seq_id: number | null
  ticket_id: number
  title: string
  status: Status
  priority: Priority
  due_date: string | null
  tags: string[]
}

interface StickiesViewProps {
  tasks: StickyTask[]
  onTaskClick: (task: any) => void
}

const PRIORITY_STYLES: Record<Priority, string> = {
  urgent: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800',
  high: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800',
  medium: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800',
  low: 'bg-gray-50 border-gray-200 opacity-80 dark:bg-gray-900/40 dark:border-gray-700',
  none: 'bg-gray-50 border-gray-200 opacity-80 dark:bg-gray-900/40 dark:border-gray-700',
}

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

function sortByPriority(tasks: StickyTask[]): StickyTask[] {
  return [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  )
}

type Lane = {
  key: string
  label: string
  emoji?: string
  helperText?: string
  tasks: StickyTask[]
  size: 'large' | 'medium' | 'small'
}

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

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function categorizeTasks(tasks: StickyTask[]): Lane[] {
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  const today = startOfToday()
  const todayStr = localDateStr(today)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = localDateStr(tomorrow)

  // End of current week (Sunday)
  const daysUntilSunday = (7 - today.getDay()) % 7
  const endOfWeekSunday = new Date(today)
  endOfWeekSunday.setDate(endOfWeekSunday.getDate() + daysUntilSunday)
  const endOfWeekStr = localDateStr(endOfWeekSunday)

  // End of current month
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const endOfMonthStr = localDateStr(endOfMonth)

  const overdue: StickyTask[] = []
  const todayTasks: StickyTask[] = []
  const tomorrowTasks: StickyTask[] = []
  const thisWeekTasks: StickyTask[] = []
  const thisMonthTasks: StickyTask[] = []

  for (const task of active) {
    if (!task.due_date) continue
    const d = task.due_date.slice(0, 10)
    if (d < todayStr) {
      overdue.push(task)
    } else if (d === todayStr) {
      todayTasks.push(task)
    } else if (d === tomorrowStr) {
      tomorrowTasks.push(task)
    } else if (d <= endOfWeekStr) {
      thisWeekTasks.push(task)
    } else if (d <= endOfMonthStr) {
      thisMonthTasks.push(task)
    }
    // Tasks beyond this month or with no due date are not shown
  }

  const lanes: Lane[] = []

  if (overdue.length > 0) {
    lanes.push({ key: 'overdue', label: 'Overdue', emoji: '🔴', tasks: sortByPriority(overdue), size: 'large' })
  }
  if (todayTasks.length > 0) {
    lanes.push({ key: 'today', label: 'Today', helperText: fmtShort(today), tasks: sortByPriority(todayTasks), size: 'large' })
  }
  if (tomorrowTasks.length > 0) {
    lanes.push({ key: 'tomorrow', label: 'Tomorrow', helperText: fmtShort(tomorrow), tasks: sortByPriority(tomorrowTasks), size: 'medium' })
  }
  if (thisWeekTasks.length > 0) {
    const weekStart = new Date(tomorrow)
    weekStart.setDate(weekStart.getDate() + 1)
    lanes.push({
      key: 'thisweek',
      label: 'This Week',
      helperText: `${fmtShort(weekStart)} – ${fmtShort(endOfWeekSunday)}`,
      tasks: sortByPriority(thisWeekTasks),
      size: 'medium',
    })
  }
  if (thisMonthTasks.length > 0) {
    const monthLaneStart = new Date(endOfWeekSunday)
    monthLaneStart.setDate(monthLaneStart.getDate() + 1)
    lanes.push({
      key: 'thismonth',
      label: 'This Month',
      helperText: `${fmtShort(monthLaneStart)} – ${fmtShort(endOfMonth)}`,
      tasks: sortByPriority(thisMonthTasks),
      size: 'small',
    })
  }

  return lanes
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

const SIZE_CONFIG = {
  large: {
    card: 'w-[380px] min-h-[350px]',
    title: 'text-lg',
  },
  medium: {
    card: 'w-[250px] min-h-[230px]',
    title: 'text-base',
  },
  small: {
    card: 'w-[170px] min-h-[160px]',
    title: 'text-sm',
  },
} as const

function StickyCard({
  task,
  size,
  onClick,
}: {
  task: StickyTask
  size: 'large' | 'medium' | 'small'
  onClick: () => void
}) {
  const config = SIZE_CONFIG[size]
  const visibleTags = (task.tags ?? []).slice(0, size === 'small' ? 1 : 3)
  const extraTagCount = (task.tags ?? []).length - visibleTags.length

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col justify-between rounded-xl border-2 shadow-md p-4 text-left transition-shadow hover:shadow-lg hover:border-foreground/30 shrink-0 cursor-pointer',
        config.card,
        size === 'small'
          ? 'bg-gray-50 border-gray-200 opacity-80 dark:bg-gray-900/40 dark:border-gray-700'
          : PRIORITY_STYLES[task.priority],
      )}
    >
      <div className="flex-1 min-h-0">
        <p className="text-muted-foreground text-xs mb-1">
          #{task.seq_id ?? task.ticket_id}
        </p>
        <p
          className={cn(
            'font-semibold line-clamp-3 break-words',
            config.title,
          )}
        >
          {task.title}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.due_date && (
          <span className="text-xs text-muted-foreground">
            {formatDueDate(task.due_date)}
          </span>
        )}
        {visibleTags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] px-1.5 py-0"
          >
            {tag}
          </Badge>
        ))}
        {extraTagCount > 0 && (
          <span className="text-[10px] text-muted-foreground">
            +{extraTagCount}
          </span>
        )}
      </div>
    </button>
  )
}

function SwimLane({
  lane,
  onTaskClick,
}: {
  lane: Lane
  onTaskClick: (task: any) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isGrabbing, setIsGrabbing] = useState(false)
  const dragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    dragRef.current = { isDragging: true, startX: e.pageX, scrollLeft: el.scrollLeft }
    setIsGrabbing(true)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.isDragging) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const dx = e.pageX - dragRef.current.startX
    el.scrollLeft = dragRef.current.scrollLeft - dx
  }

  const onMouseUp = () => {
    dragRef.current.isDragging = false
    setIsGrabbing(false)
  }

  const onMouseLeave = () => {
    dragRef.current.isDragging = false
    setIsGrabbing(false)
  }

  return (
    <div className="border-b border-border last:border-b-0 py-4">
      {/* Lane header */}
      <div className="flex items-center gap-1.5 mb-2">
        {lane.emoji && <span>{lane.emoji}</span>}
        <span className="font-semibold text-sm">{lane.label}</span>
        {lane.helperText && (
          <span className="text-xs text-muted-foreground">{lane.helperText}</span>
        )}
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
          {lane.tasks.length}
        </span>
      </div>

      {/* Horizontal scroll of stickies */}
      <div
        ref={scrollRef}
        className={cn(
          'overflow-x-auto select-none',
          isGrabbing ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div className="flex gap-3 pb-2">
          {lane.tasks.map((task) => (
            <StickyCard
              key={task.id}
              task={task}
              size={lane.size}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function StickiesView({ tasks, onTaskClick }: StickiesViewProps) {
  const lanes = useMemo(() => categorizeTasks(tasks), [tasks])

  return (
    <div className="flex-1 overflow-y-auto">
      {lanes.map((lane) => (
        <SwimLane
          key={lane.key}
          lane={lane}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  )
}
