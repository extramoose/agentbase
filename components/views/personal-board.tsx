'use client'

import 'tldraw/tldraw.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  MoreHorizontal,
  Check,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

type Task = {
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
  updated_at?: string | null
}

export type PersonalBoardProps = {
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

// ---------------------------------------------------------------------------
// Priority colors
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-400',
  medium: 'border-l-yellow-400',
  low: 'border-l-blue-400',
  none: 'border-l-transparent',
}

const PRIORITY_CHECKBOX_BORDER: Record<Priority, string> = {
  urgent: 'border-red-500',
  high: 'border-orange-400',
  medium: 'border-yellow-400',
  low: 'border-blue-400',
  none: 'border-muted-foreground/30',
}


// ---------------------------------------------------------------------------
// Time filter
// ---------------------------------------------------------------------------

type TimeFilter = 'all' | 'overdue' | 'today' | 'tomorrow' | 'this-week'

function getStartOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function matchesTimeFilter(task: Task, filter: TimeFilter): boolean {
  if (filter === 'all') return true
  if (!task.due_date) return false

  const now = new Date()
  const today = getStartOfDay(now)
  const due = getStartOfDay(new Date(task.due_date))

  if (filter === 'overdue') {
    return due.getTime() < today.getTime()
  }
  if (filter === 'today') {
    return due.getTime() === today.getTime()
  }
  if (filter === 'tomorrow') {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return due.getTime() === tomorrow.getTime()
  }
  if (filter === 'this-week') {
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    return due.getTime() >= today.getTime() && due.getTime() <= weekEnd.getTime()
  }
  return true
}

// ---------------------------------------------------------------------------
// Sticky note types & constants
// ---------------------------------------------------------------------------
// Tldraw Canvas (lazy loaded - needs browser APIs)
// ---------------------------------------------------------------------------

const TLDRAW_STORAGE_KEY = 'ab:personal-board-v2:tldraw'

const TldrawCanvas = dynamic(
  () => import('tldraw').then((mod) => {
    const { Tldraw, createTLStore, defaultShapeUtils } = mod

    function Canvas() {
      const [store] = useState(() => {
        const s = createTLStore({ shapeUtils: defaultShapeUtils })
        // Load persisted state
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(TLDRAW_STORAGE_KEY)
            if (raw) {
              const snapshot = JSON.parse(raw)
              s.loadSnapshot(snapshot)
            }
          } catch { /* ignore */ }
        }
        return s
      })

      // Persist on changes
      useEffect(() => {
        const unsub = store.listen(() => {
          try {
            const snapshot = store.getSnapshot()
            localStorage.setItem(TLDRAW_STORAGE_KEY, JSON.stringify(snapshot))
          } catch { /* ignore */ }
        }, { scope: 'document', source: 'user' })
        return unsub
      }, [store])

      return (
        <div className="w-full h-full">
          <Tldraw store={store} />
        </div>
      )
    }

    return Canvas
  }),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading canvas...</div> },
)

const PB_VISIBLE_TAGS_KEY = 'ab:personal-board-v2:visible-tags'
const PB_ACTIVE_TAGS_KEY = 'ab:personal-board-v2:active-tags'

function loadVisibleTags(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PB_VISIBLE_TAGS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function saveVisibleTags(tags: string[]) {
  try {
    localStorage.setItem(PB_VISIBLE_TAGS_KEY, JSON.stringify(tags))
  } catch { /* ignore */ }
}

function loadActiveTags(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PB_ACTIVE_TAGS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function saveActiveTags(tags: string[]) {
  try {
    localStorage.setItem(PB_ACTIVE_TAGS_KEY, JSON.stringify(tags))
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Tag selector (... menu with checkboxes)
// ---------------------------------------------------------------------------

function TagSelector({
  allTags,
  visibleTags,
  onToggleVisible,
}: {
  allTags: string[]
  visibleTags: string[]
  onToggleVisible: (tag: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = allTags.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="p-2 border-b">
          <input
            type="text"
            placeholder="Show/hide tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No tags</div>
          )}
          {filtered.map((tag) => {
            const visible = visibleTags.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => onToggleVisible(tag)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
              >
                <div
                  className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                    visible
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30',
                  )}
                >
                  {visible && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="truncate">{tag}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Task list item
// ---------------------------------------------------------------------------

const STATUS_DONE: Status[] = ['done', 'cancelled']
const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']

function TaskListItem({
  task,
  taskHref,
  isDone: isDoneProp,
}: {
  task: Task
  taskHref: (task: Task) => string
  isDone?: boolean
}) {
  const isDone = isDoneProp ?? STATUS_DONE.includes(task.status)

  return (
    <Link
      href={taskHref(task)}
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer no-underline border-b border-border/40 border-l-2',
        isDone
          ? 'border-l-transparent'
          : cn(PRIORITY_COLORS[task.priority], 'hover:bg-accent/40'),
      )}
    >
      <div
        className={cn(
          'w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
          isDone
            ? 'border-white/20 bg-white/5'
            : PRIORITY_CHECKBOX_BORDER[task.priority],
        )}
      >
        {isDone && (
          <svg className="w-3 h-3 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        className={cn(
          'text-sm leading-snug truncate',
          isDone
            ? 'line-through text-white/20'
            : 'font-medium',
        )}
      >
        {task.title}
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Task list panel
// ---------------------------------------------------------------------------

function TaskListPanel({
  tasks,
  taskHref,
}: {
  tasks: Task[]
  taskHref: (task: Task) => string
}) {
  const [visibleTags, setVisibleTags] = useState<string[]>([])
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')

  // Load from localStorage
  useEffect(() => {
    setVisibleTags(loadVisibleTags())
    setActiveTags(loadActiveTags())
  }, [])

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const task of tasks) {
      for (const tag of (task.tags ?? [])) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet).sort()
  }, [tasks])

  const toggleVisibleTag = useCallback((tag: string) => {
    setVisibleTags((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
      saveVisibleTags(next)
      // Also remove from active if hiding
      if (prev.includes(tag)) {
        setActiveTags((ap) => {
          const an = ap.filter((t) => t !== tag)
          saveActiveTags(an)
          return an
        })
      }
      return next
    })
  }, [])

  const toggleActiveTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
      saveActiveTags(next)
      return next
    })
  }, [])

  // Filter tasks
  const { activeTasks, doneTasks } = useMemo(() => {
    let filtered = tasks

    // Tag filter - "All" means all visible tags, not everything
    if (visibleTags.length > 0) {
      const filterSet = activeTags.length > 0 ? activeTags : visibleTags
      filtered = filtered.filter((t) =>
        ((t.tags ?? []).some((tag) => filterSet.includes(tag))),
      )
    }

    // Time filter
    filtered = filtered.filter((t) => matchesTimeFilter(t, timeFilter))

    // Split done vs active
    const active: Task[] = []
    const done: Task[] = []

    for (const task of filtered) {
      if (STATUS_DONE.includes(task.status)) {
        done.push(task)
      } else {
        active.push(task)
      }
    }

    // Sort active by priority
    active.sort((a, b) => {
      return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    })

    // Sort done by most recently updated first
    done.sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
      return bTime - aTime
    })

    // Limit done to 20
    done.splice(20)

    return { activeTasks: active, doneTasks: done }
  }, [tasks, activeTags, visibleTags, timeFilter])

  // Check if any overdue tasks exist (across all tasks, not just filtered)
  const hasOverdue = useMemo(() => {
    const today = getStartOfDay(new Date())
    return tasks.some((t) => {
      if (STATUS_DONE.includes(t.status)) return false
      if (!t.due_date) return false
      return getStartOfDay(new Date(t.due_date)).getTime() < today.getTime()
    })
  }, [tasks])

  const timeOptions: { value: TimeFilter; label: string; hideUnless?: boolean }[] = [
    { value: 'all', label: 'All' },
    { value: 'overdue', label: 'Overdue', hideUnless: hasOverdue },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'this-week', label: 'This Week' },
  ]

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Tag pills - visible tags can be toggled on/off, ... menu controls which show */}
      <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0 flex-wrap">
        <TagSelector
          allTags={allTags}
          visibleTags={visibleTags}
          onToggleVisible={toggleVisibleTag}
        />
        {visibleTags.length > 0 && (
          <>
            <button
              onClick={() => {
                setActiveTags([])
                saveActiveTags([])
              }}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full transition-all',
                activeTags.length === 0
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              All
            </button>
            {visibleTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleActiveTag(tag)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full transition-all',
                  activeTags.includes(tag)
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                {tag}
              </button>
            ))}
          </>
        )}
        {visibleTags.length === 0 && (
          <span className="text-xs text-muted-foreground/50">Use ... to add tags</span>
        )}
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
        {timeOptions.map((opt) => {
          if (opt.hideUnless === false) return null
          return (
            <button
              key={opt.value}
              onClick={() => setTimeFilter(opt.value)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-full transition-all',
                timeFilter === opt.value
                  ? 'bg-foreground text-background font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {activeTasks.length === 0 && doneTasks.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">No tasks</div>
        )}

        {/* Active tasks */}
        {activeTasks.map((task) => (
          <TaskListItem key={task.id} task={task} taskHref={taskHref} />
        ))}

        {/* Done tasks - very faded, group hover brings up, individual hover full */}
        {doneTasks.length > 0 && (
          <div className="mt-2 group/done [&:hover_.done-item]:opacity-40">
            {doneTasks.map((task, i) => {
              let baseOpacity = 0.1
              const fadeStart = doneTasks.length - 10
              if (i >= fadeStart) {
                const fadeIndex = i - fadeStart
                baseOpacity = 0.1 * (1 - fadeIndex / 10)
              }
              return (
                <div
                  key={task.id}
                  className="done-item hover:!opacity-100 transition-opacity duration-200"
                  style={{ opacity: baseOpacity }}
                >
                  <TaskListItem task={task} taskHref={taskHref} isDone />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel divider
// ---------------------------------------------------------------------------

function PanelDivider({ onResize }: { onResize: (dx: number) => void }) {
  const startX = useRef<number | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [onResize],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-border transition-colors select-none"
    />
  )
}

// ---------------------------------------------------------------------------
// PersonalBoard - main export
// ---------------------------------------------------------------------------

export function PersonalBoard({ tasks, taskHref, recentlyChanged: _recentlyChanged }: PersonalBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState<number | null>(null)

  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    main.style.padding = '0'
    return () => {
      main.style.padding = ''
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    const saved = localStorage.getItem('ab:personal-board-v2:left-width')
    if (saved) {
      setLeftWidth(Math.min(containerWidth * 0.8, Math.max(200, Number(saved))))
    } else {
      setLeftWidth(Math.round(containerWidth * 0.4))
    }
  }, [])

  const handleResize = useCallback((dx: number) => {
    setLeftWidth((prev) => {
      if (prev === null) return prev
      const next = Math.max(200, Math.min(prev + dx, window.innerWidth * 0.8))
      try {
        localStorage.setItem('ab:personal-board-v2:left-width', String(Math.round(next)))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex border-t"
      style={{ height: 'calc(100dvh - 56px)' }}
    >
      <div
        className="shrink-0 overflow-hidden"
        style={{ width: leftWidth ?? '40%' }}
      >
        <TaskListPanel tasks={tasks} taskHref={taskHref} />
      </div>

      <PanelDivider onResize={handleResize} />

      <TldrawCanvas />
    </div>
  )
}
