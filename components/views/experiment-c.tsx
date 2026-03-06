'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'
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
import { useSortable } from '@dnd-kit/sortable'

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

export interface ExperimentCProps {
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

// ---------------------------------------------------------------------------
// Sticky note types & constants
// ---------------------------------------------------------------------------

interface StickyNote {
  id: string
  x: number
  y: number
  width: number
  height: number
  content: string
  color: string
}

const STICKY_COLORS = [
  '#fef9c3', // pastel yellow
  '#fce7f3', // pastel pink
  '#dbeafe', // pastel blue
  '#dcfce7', // pastel green
  '#ede9fe', // pastel purple
]

const GRID_SIZE = 20
const CANVAS_WIDTH = 3000
const CANVAS_HEIGHT = 2000
const NOTE_WIDTH = 200
const NOTE_HEIGHT = 150
const STORAGE_KEY = 'ab:personal-board:stickies'
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
  let { x, y } = note
  const rect = { x, y, width: note.width, height: note.height }
  let iteration = 0

  while (iteration < maxIterations) {
    const overlapping = others.find(
      (o) => o.id !== note.id && rectsOverlap(rect, o),
    )
    if (!overlapping) break
    // Nudge right by grid, wrap down if needed
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
// localStorage persistence (debounced)
// ---------------------------------------------------------------------------

function loadStickies(): StickyNote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StickyNote[]
  } catch {
    return []
  }
}

function saveStickies(notes: StickyNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  } catch { /* quota exceeded — ignore */ }
}

// ---------------------------------------------------------------------------
// Draggable sticky note component
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
      {/* Header bar with delete */}
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
      {/* Editable content */}
      <div
        className="flex-1 px-3 pb-2 text-sm text-black/80 leading-snug overflow-hidden outline-none"
        style={{ backgroundColor: note.color }}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={(e) => {
          // Allow text selection without triggering drag
          e.stopPropagation()
        }}
        onBlur={(e) => {
          onContentChange(note.id, e.currentTarget.textContent ?? '')
        }}
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  )
}

// Overlay for the drag ghost
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
// Sticky Canvas (right panel)
// ---------------------------------------------------------------------------

function StickyCanvas() {
  const [notes, setNotes] = useState<StickyNote[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorIndexRef = useRef(0)

  // Load from localStorage on mount
  useEffect(() => {
    setNotes(loadStickies())
  }, [])

  // Debounced save
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

  // Create note
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

  // Delete note
  const deleteNote = useCallback(
    (id: string) => updateNotes((prev) => prev.filter((n) => n.id !== id)),
    [updateNotes],
  )

  // Content change
  const changeContent = useCallback(
    (id: string, content: string) =>
      updateNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n))),
    [updateNotes],
  )

  // DnD sensors
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

  // Double click on canvas to create
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only create if clicking on the canvas itself, not on a note
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
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-background">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sticky Notes</span>
        <button
          onClick={() => createNote(100, 100)}
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add note
        </button>
      </div>

      {/* Scrollable canvas */}
      <div
        className="flex-1 overflow-auto"
        onDoubleClick={handleCanvasDoubleClick}
      >
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className="relative"
            style={{
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              backgroundImage:
                'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
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

          <DragOverlay dropAnimation={null}>
            {activeNote ? <StickyOverlay note={activeNote} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task list item (left panel)
// ---------------------------------------------------------------------------

const STATUS_DONE: Status[] = ['done', 'cancelled']

function TaskListItem({
  task,
  taskHref,
}: {
  task: Task
  taskHref: (task: Task) => string
}) {
  const isDone = STATUS_DONE.includes(task.status)
  return (
    <Link
      href={taskHref(task)}
      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer no-underline border-b border-border/40"
    >
      {/* Big checkbox visual */}
      <div
        className={cn(
          'w-6 h-6 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
          isDone
            ? 'bg-primary border-primary'
            : 'border-muted-foreground/40',
        )}
      >
        {isDone && (
          <svg className="w-4 h-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span
        className={cn(
          'text-sm leading-snug truncate',
          isDone ? 'line-through text-muted-foreground' : 'font-medium',
        )}
      >
        {task.title}
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Collapsible tag section
// ---------------------------------------------------------------------------

function TagSection({
  tag,
  tasks,
  taskHref,
  defaultOpen,
}: {
  tag: string
  tasks: Task[]
  taskHref: (task: Task) => string
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tag}</span>
        <span className="text-xs text-muted-foreground/60">{tasks.length}</span>
      </button>
      {open && (
        <div>
          {tasks.map((task) => (
            <TaskListItem key={task.id} task={task} taskHref={taskHref} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task list panel (left)
// ---------------------------------------------------------------------------

function TaskListPanel({
  tasks,
  taskHref,
}: {
  tasks: Task[]
  taskHref: (task: Task) => string
}) {
  // Group tasks by tag
  const grouped = useMemo(() => {
    const tagMap = new Map<string, Task[]>()
    const untagged: Task[] = []

    for (const task of tasks) {
      if (!task.tags || task.tags.length === 0) {
        untagged.push(task)
      } else {
        for (const tag of task.tags) {
          const list = tagMap.get(tag) ?? []
          list.push(task)
          tagMap.set(tag, list)
        }
      }
    }

    // Sort tags alphabetically
    const sortedTags = Array.from(tagMap.keys()).sort()
    const groups: { tag: string; tasks: Task[] }[] = sortedTags.map((tag) => ({
      tag,
      tasks: tagMap.get(tag)!,
    }))

    if (untagged.length > 0) {
      groups.push({ tag: 'Untagged', tasks: untagged })
    }

    return groups
  }, [tasks])

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 bg-background">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tasks</span>
        <span className="text-xs text-muted-foreground/60">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">No tasks</div>
        )}
        {grouped.map((g, i) => (
          <TagSection
            key={g.tag}
            tag={g.tag}
            tasks={g.tasks}
            taskHref={taskHref}
            defaultOpen={i < 5}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Divider (draggable split handle)
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
// ExperimentC — main export
// ---------------------------------------------------------------------------

export function ExperimentC({ tasks, taskHref, recentlyChanged: _recentlyChanged }: ExperimentCProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState<number | null>(null)

  // Remove main padding (same pattern as experiment-a)
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    main.style.padding = '0'
    return () => {
      main.style.padding = ''
    }
  }, [])

  // Initialize left width to ~40% of container
  useEffect(() => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.offsetWidth
    const saved = localStorage.getItem('ab:personal-board:left-width')
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
        localStorage.setItem('ab:personal-board:left-width', String(Math.round(next)))
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
      {/* Left panel — task list */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ width: leftWidth ?? '40%' }}
      >
        <TaskListPanel tasks={tasks} taskHref={taskHref} />
      </div>

      {/* Divider */}
      <PanelDivider onResize={handleResize} />

      {/* Right panel — sticky canvas */}
      <StickyCanvas />
    </div>
  )
}
