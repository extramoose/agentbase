'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  MoreHorizontal,
  Plus,
  X,
  Check,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useSortable, SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
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

const PRIORITY_CHECKBOX_BG: Record<Priority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-blue-400',
  none: 'bg-primary',
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

type StickyNote = {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
  color: string
}

const STICKY_COLORS = [
  '#fef9c3',
  '#fce7f3',
  '#dbeafe',
  '#dcfce7',
  '#ede9fe',
]

const GRID_SIZE = 20
const CANVAS_WIDTH = 3000
const CANVAS_HEIGHT = 2000
const NOTE_WIDTH = 200
const NOTE_HEIGHT = 150
const PB_STORAGE_KEY = 'ab:personal-board-v2:stickies'
const PB_VISIBLE_TAGS_KEY = 'ab:personal-board-v2:visible-tags'
const PB_ACTIVE_TAGS_KEY = 'ab:personal-board-v2:active-tags'
const DEBOUNCE_MS = 500

// ---------------------------------------------------------------------------
// Snap & collision helpers
// ---------------------------------------------------------------------------

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function clampToCanvas(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH - w, x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - h, y)),
  }
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function nudgeToFreeSpot(
  note: StickyNote,
  others: StickyNote[],
  maxIterations = 50,
): { x: number; y: number } {
  const rect = { x: note.x, y: note.y, width: note.width, height: note.height }
  let iteration = 0

  while (iteration < maxIterations) {
    const overlapping = others.find(
      (o) => o.id !== note.id && rectsOverlap(rect, o),
    )
    if (!overlapping) break
    rect.x += GRID_SIZE
    if (rect.x + note.width > CANVAS_WIDTH) {
      rect.x = 0
      rect.y += GRID_SIZE
    }
    if (rect.y + note.height > CANVAS_HEIGHT) {
      rect.y = 0
    }
    iteration++
  }

  return clampToCanvas(rect.x, rect.y, note.width, note.height)
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadStickies(): StickyNote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PB_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StickyNote[]
  } catch {
    return []
  }
}

function saveStickies(notes: StickyNote[]) {
  try {
    localStorage.setItem(PB_STORAGE_KEY, JSON.stringify(notes))
  } catch { /* ignore */ }
}

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
// Draggable sticky note
// ---------------------------------------------------------------------------

function DraggableStickyNote({
  note,
  onDelete,
  onContentChange,
  isDragging,
}: {
  note: StickyNote
  onDelete: (id: string) => void
  onContentChange: (id: string, content: string) => void
  isDragging?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
  } = useSortable({ id: note.id })

  const style: React.CSSProperties = {
    position: 'absolute',
    left: note.x,
    top: note.y,
    width: note.width,
    height: note.height,
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : 'box-shadow 0.2s',
    zIndex: isDragging ? 999 : 1,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group rounded-lg shadow-md border border-black/10 flex flex-col cursor-grab active:cursor-grabbing select-none',
        isDragging && 'shadow-xl',
      )}
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center justify-end px-1.5 pt-1 shrink-0"
        style={{ backgroundColor: note.color }}
      >
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black/10"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(note.id)
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-3 w-3 text-black/50" />
        </button>
      </div>
      <div
        className="flex-1 px-3 pb-2 text-sm text-black/80 leading-snug overflow-hidden outline-none"
        style={{ backgroundColor: note.color }}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          onContentChange(note.id, e.currentTarget.textContent ?? '')
        }}
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  )
}

function StickyOverlay({ note }: { note: StickyNote }) {
  return (
    <div
      style={{
        width: note.width,
        height: note.height,
        backgroundColor: note.color,
      }}
      className="rounded-lg shadow-xl border border-black/10 flex flex-col"
    >
      <div className="flex-1 px-3 py-2 text-sm text-black/80 leading-snug overflow-hidden">
        {note.content}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sticky Canvas
// ---------------------------------------------------------------------------

function StickyCanvas() {
  const [notes, setNotes] = useState<StickyNote[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorIndexRef = useRef(0)

  useEffect(() => {
    setNotes(loadStickies())
  }, [])

  const debouncedSave = useCallback((updated: StickyNote[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveStickies(updated), DEBOUNCE_MS)
  }, [])

  const updateNotes = useCallback(
    (updater: (prev: StickyNote[]) => StickyNote[]) => {
      setNotes((prev) => {
        const next = updater(prev)
        debouncedSave(next)
        return next
      })
    },
    [debouncedSave],
  )

  const createNote = useCallback(
    (x: number, y: number) => {
      const snapped = clampToCanvas(snapToGrid(x), snapToGrid(y), NOTE_WIDTH, NOTE_HEIGHT)
      const color = STICKY_COLORS[colorIndexRef.current % STICKY_COLORS.length]
      colorIndexRef.current++
      const newNote: StickyNote = {
        id: `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        x: snapped.x,
        y: snapped.y,
        width: NOTE_WIDTH,
        height: NOTE_HEIGHT,
        content: '',
        color,
      }
      updateNotes((prev) => {
        const pos = nudgeToFreeSpot(newNote, prev)
        return [...prev, { ...newNote, x: pos.x, y: pos.y }]
      })
    },
    [updateNotes],
  )

  const deleteNote = useCallback(
    (id: string) => updateNotes((prev) => prev.filter((n) => n.id !== id)),
    [updateNotes],
  )

  const changeContent = useCallback(
    (id: string, content: string) =>
      updateNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n))),
    [updateNotes],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null)
      const { active, delta } = event
      if (!delta) return

      updateNotes((prev) => {
        const idx = prev.findIndex((n) => n.id === String(active.id))
        if (idx === -1) return prev
        const note = prev[idx]
        const rawX = note.x + delta.x
        const rawY = note.y + delta.y
        const snappedX = snapToGrid(rawX)
        const snappedY = snapToGrid(rawY)
        const clamped = clampToCanvas(snappedX, snappedY, note.width, note.height)
        const moved = { ...note, x: clamped.x, y: clamped.y }
        const others = prev.filter((_, i) => i !== idx)
        const final = nudgeToFreeSpot(moved, others)
        const next = [...prev]
        next[idx] = { ...moved, x: final.x, y: final.y }
        return next
      })
    },
    [updateNotes],
  )

  const activeNote = activeId ? notes.find((n) => n.id === activeId) : null

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-sticky-note]')) return
      const rect = e.currentTarget.getBoundingClientRect()
      const scrollLeft = e.currentTarget.scrollLeft
      const scrollTop = e.currentTarget.scrollTop
      const x = e.clientX - rect.left + scrollLeft
      const y = e.clientY - rect.top + scrollTop
      createNote(x, y)
    },
    [createNote],
  )

  return (
    <div className="relative flex-1 flex flex-col h-full min-w-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-background">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
        <button
          onClick={() => createNote(100, 100)}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add note
        </button>
      </div>

      <div
        className="flex-1 overflow-auto"
        onDoubleClick={handleCanvasDoubleClick}
      >
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={notes.map((n) => n.id)} strategy={rectSortingStrategy}>
            <div
              className="relative"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                backgroundImage:
                  'radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)',
                backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              }}
            >
              {notes.map((note) => (
                <DraggableStickyNote
                  key={note.id}
                  note={note}
                  onDelete={deleteNote}
                  onContentChange={changeContent}
                  isDragging={note.id === activeId}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeNote ? <StickyOverlay note={activeNote} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
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
  opacity,
}: {
  task: Task
  taskHref: (task: Task) => string
  opacity?: number
}) {
  const isDone = STATUS_DONE.includes(task.status)

  return (
    <Link
      href={taskHref(task)}
      className={cn(
        'flex items-center gap-3 px-4 py-3.5 transition-all cursor-pointer no-underline border-b border-border/40 border-l-2',
        isDone
          ? 'border-l-transparent'
          : cn(PRIORITY_COLORS[task.priority], 'hover:bg-accent/40'),
      )}
      style={opacity !== undefined ? { opacity } : undefined}
    >
      <div
        className={cn(
          'w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
          isDone
            ? 'bg-muted-foreground/20 border-muted-foreground/20'
            : PRIORITY_CHECKBOX_BORDER[task.priority],
        )}
      >
        {isDone && (
          <svg className="w-3 h-3 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        className={cn(
          'text-sm leading-snug truncate',
          isDone
            ? 'line-through text-muted-foreground/30'
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

    // Tag filter (if any active)
    if (activeTags.length > 0) {
      filtered = filtered.filter((t) =>
        ((t.tags ?? []).some((tag) => activeTags.includes(tag))),
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

    // Limit done to 20
    done.splice(20)

    return { activeTasks: active, doneTasks: done }
  }, [tasks, activeTags, timeFilter])

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

        {/* Done tasks - faded, last 10 fade to 0 */}
        {doneTasks.length > 0 && (
          <div className="mt-2">
            {doneTasks.map((task, i) => {
              let opacity = 0.15
              // Last 10 fade from 0.15 to 0
              const fadeStart = doneTasks.length - 10
              if (i >= fadeStart) {
                const fadeIndex = i - fadeStart
                opacity = 0.15 * (1 - fadeIndex / 10)
              }
              return (
                <div key={task.id} className="hover:!opacity-100 transition-opacity">
                  <TaskListItem task={task} taskHref={taskHref} opacity={opacity} />
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

      <StickyCanvas />
    </div>
  )
}
