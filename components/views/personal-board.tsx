'use client'

import 'tldraw/tldraw.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  MoreHorizontal,
  Tag,
  Calendar,
  Check,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
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
const SAVE_DEBOUNCE_MS = 2000

const TldrawCanvas = dynamic(
  () => import('tldraw').then((mod) => {
    const { Tldraw, createTLStore, defaultShapeUtils, useTldrawUser } = mod

    function Canvas() {
      const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
      const [loaded, setLoaded] = useState(false)

      // Force dark mode — AgentBase is dark-only
      const user = useTldrawUser({
        userPreferences: { id: 'ab-user', colorScheme: 'dark' },
      })

      // Load snapshot from Supabase on mount, fallback to localStorage
      useEffect(() => {
        let cancelled = false
        async function load() {
          try {
            const supabase = createClient()
            const { data } = await supabase.rpc('rpc_load_tldraw_snapshot')
            if (!cancelled && data) {
              store.loadSnapshot(data)
              setLoaded(true)
              return
            }
          } catch { /* Supabase unavailable, fall through */ }

          // Fallback: migrate from localStorage
          if (!cancelled && typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem(TLDRAW_STORAGE_KEY)
              if (raw) {
                store.loadSnapshot(JSON.parse(raw))
              }
            } catch { /* ignore */ }
          }
          if (!cancelled) setLoaded(true)
        }
        load()
        return () => { cancelled = true }
      }, [store])

      // Persist to Supabase on changes (debounced)
      useEffect(() => {
        if (!loaded) return
        let timer: ReturnType<typeof setTimeout> | null = null
        const unsub = store.listen(() => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            try {
              const snapshot = store.getSnapshot()
              const supabase = createClient()
              supabase.rpc('rpc_upsert_tldraw_snapshot', {
                p_snapshot: snapshot,
              }).then(() => {
                // Also keep localStorage as offline fallback
                try {
                  localStorage.setItem(TLDRAW_STORAGE_KEY, JSON.stringify(snapshot))
                } catch { /* ignore */ }
              })
            } catch { /* ignore */ }
          }, SAVE_DEBOUNCE_MS)
        }, { scope: 'document', source: 'user' })
        return () => {
          unsub()
          if (timer) clearTimeout(timer)
        }
      }, [store, loaded])

      return (
        <div className="w-full h-full relative z-0 isolate" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
          <Tldraw store={store} user={user} />
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

const STATUS_DONE: Status[] = ['done']
const STATUS_HIDDEN: Status[] = ['cancelled']
const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']

function TaskListItem({
  task,
  taskHref,
  isDone: isDoneProp,
  showTags,
  showDueDate,
}: {
  task: Task
  taskHref: (task: Task) => string
  isDone?: boolean
  showTags?: boolean
  showDueDate?: boolean
}) {
  const isDone = isDoneProp ?? STATUS_DONE.includes(task.status)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [updating, setUpdating] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)

  const handleCheck = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isDone || updating) return
    setJustCompleted(true)
    try {
      await fetch('/api/commands/update-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, fields: { status: 'done' } }),
      })
    } catch { /* ignore */ }
    // Keep showing for 15 seconds before realtime removes it
    setTimeout(() => setJustCompleted(false), 15000)
  }, [isDone, updating, task.id])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  const quickUpdate = useCallback(async (fields: Record<string, unknown>) => {
    setUpdating(true)
    setCtxMenu(null)
    try {
      await fetch('/api/commands/update-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, fields }),
      })
    } catch { /* ignore */ }
    setUpdating(false)
  }, [task.id])

  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const formatDate = (d: Date) => d.toISOString().split('T')[0]

  const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString())
  const isUrgent = task.priority === 'urgent'
  const isHigh = task.priority === 'high'

  return (
    <div className="relative">
      <Link
        href={taskHref(task)}
        className={cn(
          'group/row flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer no-underline border-b border-border/40',
          isDone ? '' : 'hover:bg-accent/40',
          updating && 'opacity-50',
        )}
        onContextMenu={(e) => {
          if (isDone) return
          e.preventDefault()
          setCtxMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <div
          onClick={handleCheck}
          className={cn(
            'w-5 h-5 rounded shrink-0 flex items-center justify-center transition-all cursor-pointer',
            (isDone || justCompleted)
              ? 'border-2 border-green-400/60 bg-green-400/10'
              : task.status === 'in_progress'
                ? 'border-2 border-white/40'
                : 'border border-white/15 hover:border-2 hover:border-white/40',
          )}
        >
          {(isDone || justCompleted) && (
            <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {!isDone && !justCompleted && task.status === 'in_progress' && (
            <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
          )}
        </div>
        {!isDone && (task.priority === 'urgent' || task.priority === 'high') && (
          <div
            className={cn(
              'w-2 h-2 rounded-full shrink-0',
              task.priority === 'urgent' ? 'bg-red-500' : 'bg-yellow-400',
            )}
          />
        )}
        <span
          className={cn(
            'text-sm leading-snug truncate',
            isDone
              ? 'line-through text-white'
              : 'font-medium',
          )}
        >
          {task.title}
        </span>
        {/* Due date - inline after title */}
        {showDueDate && !isDone && task.due_date && (
          <span className="shrink-0 text-xs text-white/20 group-hover/row:text-white transition-colors tabular-nums">
            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {/* Tags - right aligned */}
        {showTags && !isDone && (task.tags ?? []).length > 0 && (
          <div className="flex items-center gap-1 ml-auto shrink-0">
            {(task.tags ?? []).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[10px] rounded-full border border-white/10 text-white/25 group-hover/row:text-white/80 group-hover/row:border-white/30 transition-all"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </Link>
      {ctxMenu && (
        <div
          className="fixed bg-popover border border-border rounded-lg shadow-xl py-1 z-[100] min-w-[160px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Complete */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
            onClick={() => quickUpdate({ status: 'done' })}
          >
            <span className="text-green-400">✓</span> Mark Done
          </button>

          {/* Priority section */}
          {!isUrgent && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ priority: 'urgent' })}
            >
              <span className="text-red-400">●</span> Urgent
            </button>
          )}
          {!isHigh && !isUrgent && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ priority: 'high' })}
            >
              <span className="text-yellow-400">●</span> High Priority
            </button>
          )}
          {(isUrgent || isHigh) && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ priority: 'medium' })}
            >
              <span className="text-muted-foreground">↓</span> Lower Priority
            </button>
          )}

          <div className="border-t border-border my-1" />

          {/* Due date */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
            onClick={() => quickUpdate({ due_date: formatDate(today) })}
          >
            <span className="text-blue-400">◇</span> Due Today
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
            onClick={() => quickUpdate({ due_date: formatDate(tomorrow) })}
          >
            <span className="text-muted-foreground">◇</span> Due Tomorrow
          </button>
          {task.due_date && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ due_date: null })}
            >
              <span className="text-muted-foreground">✕</span> Clear Due Date
            </button>
          )}

          {/* Contextual */}
          {isOverdue && (
            <>
              <div className="border-t border-border my-1" />
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2 text-red-400"
                onClick={() => quickUpdate({ due_date: formatDate(today), priority: 'urgent' })}
              >
                🔥 Overdue → Urgent + Today
              </button>
            </>
          )}

          <div className="border-t border-border my-1" />

          {/* Status */}
          {task.status !== 'blocked' && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ status: 'blocked' })}
            >
              <span className="text-orange-400">⊘</span> Blocked
            </button>
          )}
          {task.status !== 'in_progress' && (
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
              onClick={() => quickUpdate({ status: 'in_progress' })}
            >
              <span className="text-blue-400">▶</span> In Progress
            </button>
          )}
        </div>
      )}
    </div>
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
  const [showEverything, setShowEverything] = useState(false)
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

    // Tag filter
    if (activeTags.length > 0) {
      // Focus mode - filter to selected tags (works in both modes)
      filtered = filtered.filter((t) =>
        ((t.tags ?? []).some((tag) => activeTags.includes(tag))),
      )
    } else if (!showEverything && visibleTags.length > 0) {
      // My Board mode with no focus - scope to visible tags
      filtered = filtered.filter((t) =>
        ((t.tags ?? []).some((tag) => visibleTags.includes(tag))),
      )
    }
    // Everything mode with no focus - no tag filter

    // Time filter
    filtered = filtered.filter((t) => matchesTimeFilter(t, timeFilter))

    // Split done vs active
    const active: Task[] = []
    const done: Task[] = []

    for (const task of filtered) {
      if (STATUS_HIDDEN.includes(task.status)) continue
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
  }, [tasks, activeTags, visibleTags, showEverything, timeFilter])

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
      {/* Tag filter row */}
      <div className="flex items-center gap-1 px-4 py-2 border-b shrink-0 overflow-x-auto scrollbar-none whitespace-nowrap">
        <div className="w-5 h-5 flex items-center justify-center shrink-0"><Tag className="h-3.5 w-3.5 text-muted-foreground/40" /></div>
        <div className="w-px h-5 bg-border mx-1" />
        <button
          onClick={() => {
            setShowEverything(true)
            setActiveTags([])
            saveActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 text-xs rounded-full transition-all',
            showEverything
              ? 'bg-foreground text-background font-medium'
              : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10',
          )}
        >
          Everything
        </button>
        <button
          onClick={() => {
            setShowEverything(false)
            setActiveTags([])
            saveActiveTags([])
          }}
          className={cn(
            'px-2.5 py-1 text-xs rounded-full transition-all',
            !showEverything
              ? 'bg-foreground text-background font-medium'
              : 'bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10',
          )}
        >
          My Board
        </button>
        <div className="w-px h-5 bg-border mx-1" />
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
        {(showEverything ? allTags : visibleTags).map((tag) => (
          <button
            key={tag}
            onClick={() => toggleActiveTag(tag)}
            className={cn(
              'px-2.5 py-1 text-xs rounded-full transition-all',
              activeTags.includes(tag)
                ? 'bg-foreground text-background font-medium ring-1 ring-foreground/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            {tag}
          </button>
        ))}
        {!showEverything && (
          <TagSelector
            allTags={allTags}
            visibleTags={visibleTags}
            onToggleVisible={toggleVisibleTag}
          />
        )}
      </div>

      {/* Time filter row */}
      <div className="flex items-center gap-1 px-4 py-2 border-b shrink-0 overflow-x-auto scrollbar-none whitespace-nowrap">
        <div className="w-5 h-5 flex items-center justify-center shrink-0"><Calendar className="h-3.5 w-3.5 text-muted-foreground/40" /></div>
        <div className="w-px h-5 bg-border mx-1" />
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
          <TaskListItem key={task.id} task={task} taskHref={taskHref} showTags={activeTags.length === 0} showDueDate={timeFilter === 'all'} />
        ))}

        {/* Done tasks - white at 15%, group hover 40%, individual hover 80% */}
        {doneTasks.length > 0 && (
          <div className="mt-2 group/done">
            {doneTasks.map((task) => (
              <div
                key={task.id}
                className="opacity-[0.15] group-hover/done:opacity-40 hover:!opacity-80 transition-opacity duration-200"
              >
                <TaskListItem task={task} taskHref={taskHref} isDone showTags={false} showDueDate={false} />
              </div>
            ))}
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
