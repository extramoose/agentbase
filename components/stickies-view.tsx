'use client'

import { useMemo } from 'react'
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

type Lane = {
  key: string
  label: string
  emoji?: string
  tasks: StickyTask[]
  size: 'large' | 'medium' | 'small'
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function categorizeTasks(tasks: StickyTask[]): Lane[] {
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled')

  const today = startOfToday()
  const todayStr = today.toISOString().slice(0, 10)
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekStr = nextWeek.toISOString().slice(0, 10)

  const overdue: StickyTask[] = []
  const todayTasks: StickyTask[] = []
  const upNext: StickyTask[] = []
  const later: StickyTask[] = []

  for (const task of active) {
    if (!task.due_date) {
      later.push(task)
      continue
    }
    const d = task.due_date.slice(0, 10)
    if (d < todayStr) {
      overdue.push(task)
    } else if (d === todayStr) {
      todayTasks.push(task)
    } else if (d <= nextWeekStr) {
      upNext.push(task)
    } else {
      later.push(task)
    }
  }

  const lanes: Lane[] = []
  if (overdue.length > 0) {
    lanes.push({ key: 'overdue', label: 'Overdue', emoji: '\ud83d\udd34', tasks: overdue, size: 'large' })
  }
  lanes.push({ key: 'today', label: 'Today', tasks: todayTasks, size: 'large' })
  lanes.push({ key: 'upnext', label: 'Up Next', tasks: upNext, size: 'medium' })
  lanes.push({ key: 'later', label: 'Later', tasks: later, size: 'small' })

  return lanes
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
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
  const visibleTags = task.tags.slice(0, size === 'small' ? 1 : 3)
  const extraTagCount = task.tags.length - visibleTags.length

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col justify-between rounded-xl border-2 shadow-md p-4 text-left transition-transform hover:scale-[1.02] hover:shadow-lg shrink-0 cursor-pointer',
        config.card,
        PRIORITY_STYLES[task.priority],
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
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-start gap-4 py-4">
        {/* Sticky lane header */}
        <div className="shrink-0 w-28 pt-2 sticky left-0">
          <div className="flex items-center gap-1.5">
            {lane.emoji && <span>{lane.emoji}</span>}
            <span className="font-semibold text-sm">{lane.label}</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
              {lane.tasks.length}
            </span>
          </div>
        </div>

        {/* Horizontal scroll of stickies */}
        <div className="flex-1 overflow-x-auto min-w-0">
          {lane.tasks.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              No tasks
            </div>
          ) : (
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
          )}
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
