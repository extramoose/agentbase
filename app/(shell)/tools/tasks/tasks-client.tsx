'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, ChevronDown, ChevronRight, AlertCircle, ArrowUp, Minus, ArrowDown, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ActorChip } from '@/components/actor-chip'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { TaskModal } from './task-modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

type TaskType = 'bug' | 'improvement' | 'feature'

type Task = {
  id: string
  ticket_id: number
  title: string
  body: string | null
  status: Status
  priority: Priority
  type: TaskType | null
  tags: string[]
  due_date: string | null
  assignee_id: string | null
  assignee_type: 'human' | 'agent' | null
  sort_order: number
  source_meeting_id: string | null
  created_at: string
  updated_at: string
}

type CurrentUser = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string
} | null

type WorkspaceMember = {
  id: string
  name: string
  avatarUrl: string | null
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']
const STATUS_ORDER: Status[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled']

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-500' },
  high: { label: 'High', color: 'text-orange-400' },
  medium: { label: 'Medium', color: 'text-muted-foreground' },
  low: { label: 'Low', color: 'text-slate-400' },
  none: { label: 'No priority', color: 'text-muted-foreground' },
}

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  backlog: { label: 'Backlog', className: 'bg-zinc-500/20 text-zinc-400' },
  todo: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/20 text-blue-400' },
  blocked: { label: 'Blocked', className: 'bg-red-500/20 text-red-400' },
  done: { label: 'Done', className: 'bg-green-500/20 text-green-400' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-300/60' },
}

const STATUS_TABS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; className: string }> = {
  bug: { label: 'bug', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  improvement: { label: 'improvement', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  feature: { label: 'feature', className: 'bg-violet-500/20 text-violet-400 border border-violet-500/30' },
}

const TASK_TYPE_TABS: Array<{ value: TaskType | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'bug', label: 'Bug' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'feature', label: 'Feature' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  switch (priority) {
    case 'urgent':
      return <AlertCircle className={cn('h-4 w-4 text-red-500', className)} />
    case 'high':
      return <ArrowUp className={cn('h-4 w-4 text-orange-400', className)} />
    case 'medium':
      return <Minus className={cn('h-4 w-4 text-muted-foreground', className)} />
    case 'low':
      return <ArrowDown className={cn('h-4 w-4 text-slate-400', className)} />
    case 'none':
      return <Minus className={cn('h-4 w-4 text-muted-foreground/50', className)} />
  }
}

function groupByPriority(tasks: Task[]): Record<Priority, Task[]> {
  const groups: Record<Priority, Task[]> = {
    urgent: [],
    high: [],
    medium: [],
    low: [],
    none: [],
  }
  for (const t of tasks) {
    groups[t.priority].push(t)
  }
  return groups
}

// ---------------------------------------------------------------------------
// Sortable task row
// ---------------------------------------------------------------------------

function SortableTaskRow({
  task,
  onClick,
  selected,
  onToggle,
  selectionActive,
}: {
  task: Task
  onClick: () => void
  selected: boolean
  onToggle: () => void
  selectionActive: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const statusCfg = STATUS_CONFIG[task.status]
  const visibleTags = (task.tags ?? []).slice(0, 2)
  const extraTagCount = (task.tags ?? []).length - 2

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer border border-transparent hover:border-border transition-colors"
      onClick={onClick}
    >
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'cb-dark h-4 w-4 shrink-0',
          selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      />

      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Ticket ID */}
      <span className="text-xs text-muted-foreground w-12 shrink-0">
        #{task.ticket_id}
      </span>

      {/* Type badge */}
      {task.type && (
        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium shrink-0', TASK_TYPE_CONFIG[task.type].className)}>
          {task.type}
        </span>
      )}

      {/* Priority icon */}
      <span className="shrink-0" title={PRIORITY_CONFIG[task.priority].label}>
        <PriorityIcon priority={task.priority} />
      </span>

      {/* Title */}
      <span className={cn('flex-1 text-sm font-medium truncate', task.status === 'cancelled' && 'line-through text-muted-foreground/60')}>{task.title}</span>

      {/* Status badge */}
      <Badge
        variant="secondary"
        className={cn('text-xs shrink-0 hidden sm:inline-flex', statusCfg.className)}
      >
        {statusCfg.label}
      </Badge>

      {/* Assignee */}
      <span className="hidden sm:inline-flex">
        {task.assignee_id ? (
          <ActorChip actorId={task.assignee_id} actorType={task.assignee_type as 'human' | 'agent'} compact />
        ) : (
          <span className="text-xs text-muted-foreground shrink-0">Unassigned</span>
        )}
      </span>

      {/* Due date */}
      {task.due_date && (
        <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
          {new Date(task.due_date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="hidden md:flex gap-1 shrink-0">
          {visibleTags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-xs px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
          {extraTagCount > 0 && (
            <span className="text-xs text-muted-foreground">
              +{extraTagCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Priority group
// ---------------------------------------------------------------------------

function PriorityGroup({
  priority,
  tasks,
  onTaskClick,
  addingTo,
  onStartAdding,
  onCreateTask,
  selectedIds,
  onToggleSelection,
}: {
  priority: Priority
  tasks: Task[]
  onTaskClick: (task: Task) => void
  addingTo: boolean
  onStartAdding: () => void
  onCreateTask: (title: string, priority: Priority) => void
  selectedIds: Set<string>
  onToggleSelection: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cfg = PRIORITY_CONFIG[priority]
  const { setNodeRef } = useDroppable({ id: `droppable-${priority}` })

  useEffect(() => {
    if (addingTo) inputRef.current?.focus()
  }, [addingTo])

  function handleCreate() {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    onCreateTask(trimmed, priority)
    setNewTitle('')
  }

  return (
    <div className="mb-4">
      {/* Group header */}
      <button
        className="flex items-center gap-2 py-1.5 px-1 w-full text-left hover:bg-muted/30 rounded-md transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn('text-sm font-medium flex items-center gap-1.5', cfg.color)}>
          <PriorityIcon priority={priority} className="h-3.5 w-3.5" />
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
      </button>

      {!collapsed && (
        <div ref={setNodeRef} className="ml-1 min-h-[2px]">
          {/* Quick-add input */}
          {addingTo && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Input
                ref={inputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') setNewTitle('')
                }}
                placeholder="Task title — press Enter to save"
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>
                Add
              </Button>
            </div>
          )}

          {/* Sortable task rows */}
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                onClick={() => onTaskClick(task)}
                selected={selectedIds.has(task.id)}
                onToggle={() => onToggleSelection(task.id)}
                selectionActive={selectedIds.size > 0}
              />
            ))}
          </SortableContext>

          {tasks.length === 0 && !addingTo && (
            <button
              onClick={onStartAdding}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function TasksClient({
  initialTasks,
  currentUser: _currentUser,
  initialSelectedTask,
}: {
  initialTasks: Task[]
  currentUser: CurrentUser
  initialSelectedTask?: Task
}) {
  const searchParams = useSearchParams()

  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>(
    () => {
      const s = searchParams.get('status')
      const valid: Array<Status | 'all'> = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled', 'all']
      return valid.includes(s as Status | 'all') ? (s as Status | 'all') : 'todo'
    }
  )
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>(
    () => {
      const t = searchParams.get('type')
      const valid: Array<TaskType | 'all'> = ['bug', 'improvement', 'feature', 'all']
      return valid.includes(t as TaskType | 'all') ? (t as TaskType | 'all') : 'all'
    }
  )
  const [addingToPriority, setAddingToPriority] = useState<Priority | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mounted, setMounted] = useState(false)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null)
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(initialSelectedTask ?? null)

  const supabase = createClient()

  // Build query string from current filter state
  const buildQs = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (typeFilter !== 'all') params.set('type', typeFilter)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [search, statusFilter, typeFilter])

  // Sync filter/search state → URL query params (skip initial render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    window.history.replaceState(null, '', `${window.location.pathname}${buildQs()}`)
  }, [buildQs])

  // Hydration guard — defer dnd-kit tree to avoid SSR ID mismatch
  useEffect(() => setMounted(true), [])

  // Fetch workspace members for assignee filter
  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch('/api/workspace/members')
        if (!res.ok) return
        const json = await res.json() as {
          success: boolean
          data: {
            agents: Array<{ id: string; name: string; avatar_url: string | null }>
            humans: Array<{ id: string; name: string; avatar_url: string | null }>
          }
        }
        if (!json.success) return
        const members: WorkspaceMember[] = [
          ...json.data.humans.map((h) => ({ id: h.id, name: h.name, avatarUrl: h.avatar_url })),
          ...json.data.agents.map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatar_url })),
        ]
        setWorkspaceMembers(members)
      } catch {
        // silently ignore — filter chips just won't show
      }
    }
    fetchMembers()
  }, [])

  // ----- Shelf open/close with URL sync -----

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task)
    window.history.pushState(null, '', `/tools/tasks/${task.ticket_id}`)
  }, [])

  const handleShelfClose = useCallback(() => {
    setSelectedTask(null)
    window.history.pushState(null, '', `/tools/tasks${buildQs()}`)
  }, [buildQs])

  // Handle browser back/forward button
  useEffect(() => {
    const handler = () => {
      if (!window.location.pathname.match(/\/tools\/tasks\/\d+/)) {
        setSelectedTask(null)
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ----- Realtime subscription -----

  useEffect(() => {
    const channel = supabase
      .channel('tasks:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        (payload) => {
          const newTask = payload.new as Task
          setTasks((prev) => {
            if (prev.some((t) => t.id === newTask.id)) return prev
            return [...prev, newTask]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        (payload) => {
          const updated = payload.new as Task
          setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setTasks((prev) => {
            if (!prev.find((t) => t.id === deletedId)) return prev
            return prev.filter((t) => t.id !== deletedId)
          })
          setSelectedIds((prev) => {
            if (!prev.has(deletedId)) return prev
            const next = new Set(prev)
            next.delete(deletedId)
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // ----- Filtered & grouped tasks -----

  const filteredTasks = useMemo(() => {
    let result = tasks

    // Hide cancelled unless on the Cancelled tab
    if (statusFilter !== 'cancelled') {
      result = result.filter((t) => t.status !== 'cancelled')
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter)
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((t) => t.type === typeFilter)
    }

    // Assignee filter
    if (assigneeFilter) {
      result = result.filter((t) => t.assignee_id === assigneeFilter)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      )
    }

    return result
  }, [tasks, statusFilter, typeFilter, search, assigneeFilter])

  const grouped = useMemo(() => groupByPriority(filteredTasks), [filteredTasks])

  // Count tasks per status, respecting type + assignee + search filters (but NOT status)
  const statusCounts = useMemo(() => {
    let base = tasks
    if (typeFilter !== 'all') {
      base = base.filter((t) => t.type === typeFilter)
    }
    if (assigneeFilter) {
      base = base.filter((t) => t.assignee_id === assigneeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      )
    }
    return {
      all: base.length,
      backlog: base.filter((t) => t.status === 'backlog').length,
      todo: base.filter((t) => t.status === 'todo').length,
      in_progress: base.filter((t) => t.status === 'in_progress').length,
      blocked: base.filter((t) => t.status === 'blocked').length,
      done: base.filter((t) => t.status === 'done').length,
      cancelled: base.filter((t) => t.status === 'cancelled').length,
    } as Record<Status | 'all', number>
  }, [tasks, typeFilter, assigneeFilter, search])

  // ----- Create task -----

  const createTask = useCallback(
    async (title: string, priority: Priority) => {
      // Optimistic: add a placeholder
      const tempId = `temp-${Date.now()}`
      const optimistic: Task = {
        id: tempId,
        ticket_id: 0,
        title,
        body: null,
        status: statusFilter !== 'all' ? statusFilter : 'todo',
        priority,
        type: null,
        tags: [],
        due_date: null,
        assignee_id: null,
        assignee_type: null,
        sort_order: 0,
        source_meeting_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTasks((prev) => [optimistic, ...prev])
      setAddingToPriority(null)

      try {
        const res = await fetch('/api/commands/create-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            priority,
            status: statusFilter !== 'all' ? statusFilter : 'todo',
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Failed to create task')

        // Replace optimistic with real
        setTasks((prev) =>
          prev.map((t) => (t.id === tempId ? (json.data as Task) : t))
        )
        toast({ type: 'success', message: 'Task created' })
      } catch (err) {
        // Remove optimistic on failure
        setTasks((prev) => prev.filter((t) => t.id !== tempId))
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to create task',
        })
      }
    },
    [statusFilter]
  )

  // ----- Update task field via command bus -----

  const updateTaskField = useCallback(
    async (taskId: string, fields: Record<string, unknown>) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...fields, updated_at: new Date().toISOString() } : t))
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'tasks', id: taskId, fields }),
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
    []
  )

  // ----- Drag reorder / cross-group priority change -----

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const activeTask = filteredTasks.find((t) => t.id === active.id)
      if (!activeTask) return

      // Determine target priority
      const overIdStr = String(over.id)
      let targetPriority: Priority
      if (overIdStr.startsWith('droppable-')) {
        targetPriority = overIdStr.replace('droppable-', '') as Priority
      } else {
        const overTask = filteredTasks.find((t) => t.id === over.id)
        if (!overTask) return
        targetPriority = overTask.priority
      }

      if (activeTask.priority === targetPriority) {
        // Same group: reorder
        const group = grouped[targetPriority]
        const oldIndex = group.findIndex((t) => t.id === active.id)
        const newIndex = group.findIndex((t) => t.id === over.id)
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

        const reordered = arrayMove(group, oldIndex, newIndex)

        setTasks((prev) => {
          const otherTasks = prev.filter((t) => t.priority !== targetPriority)
          const updated = reordered.map((t, i) => ({ ...t, sort_order: i }))
          return [...otherTasks, ...updated]
        })

        updateTaskField(activeTask.id, { sort_order: newIndex })
      } else {
        // Cross-group: update priority
        const targetGroup = grouped[targetPriority]
        const newSortOrder = targetGroup.length

        setTasks((prev) =>
          prev.map((t) =>
            t.id === activeTask.id
              ? { ...t, priority: targetPriority, sort_order: newSortOrder, updated_at: new Date().toISOString() }
              : t
          )
        )

        updateTaskField(activeTask.id, { priority: targetPriority, sort_order: newSortOrder })
      }
    },
    [filteredTasks, grouped, updateTaskField]
  )

  // ----- New task button -----

  function handleNewTask() {
    setAddingToPriority('medium')
  }

  // ----- Selection helpers -----

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredTasks.length) return new Set()
      return new Set(filteredTasks.map((t) => t.id))
    })
  }, [filteredTasks])

  // ----- Batch actions -----

  const batchUpdate = useCallback(async (fields: Record<string, unknown>) => {
    const ids = Array.from(selectedIds)
    setTasks((prev) =>
      prev.map((t) => (ids.includes(t.id) ? { ...t, ...fields, updated_at: new Date().toISOString() } : t))
    )
    try {
      const res = await fetch('/api/commands/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'tasks', ids, fields }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Batch update failed')
      toast({ type: 'success', message: `Updated ${ids.length} tasks` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Batch update failed' })
    }
  }, [selectedIds])

  const batchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (!window.confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return

    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)))
    setSelectedIds(new Set())
    try {
      const results = await Promise.all(ids.map((id) => fetch('/api/commands/delete-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'tasks', id }),
      })))
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) throw new Error(`${failed.length} deletes failed`)
      toast({ type: 'success', message: `Deleted ${ids.length} task${ids.length === 1 ? '' : 's'}` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
    }
  }, [selectedIds])

  // ----- Escape to clear selection -----

  useEffect(() => {
    if (selectedIds.size === 0) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIds(new Set())
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedIds.size])

  // ----- Visible priority groups -----

  const visiblePriorities = PRIORITY_ORDER.filter(
    (p) => grouped[p].length > 0 || addingToPriority === p
  )

  // If no groups visible, show all when on 'todo' filter
  const displayPriorities =
    visiblePriorities.length === 0 && statusFilter === 'todo'
      ? PRIORITY_ORDER
      : visiblePriorities.length === 0
        ? ['medium' as Priority]
        : visiblePriorities

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold shrink-0">Tasks</h1>
        <div className="flex items-center gap-2">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search tasks..."
          />
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">New Task</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              statusFilter === tab.value
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {statusCounts[tab.value]}
            </span>
          </button>
        ))}

        {/* Type filter chips + assignee face pile */}
        <div className="sm:ml-auto flex items-center gap-1 flex-wrap">
          {TASK_TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md transition-colors',
                typeFilter === tab.value
                  ? tab.value === 'all'
                    ? 'bg-muted text-foreground font-medium'
                    : cn('font-medium', TASK_TYPE_CONFIG[tab.value].className)
                  : 'bg-zinc-800 text-zinc-500'
              )}
            >
              {tab.label}
            </button>
          ))}

          {workspaceMembers.length > 0 && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <div className="flex -space-x-1">
                {workspaceMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setAssigneeFilter(assigneeFilter === m.id ? null : m.id)}
                    title={m.name}
                    className="relative rounded-full transition-transform hover:z-10 hover:scale-110"
                  >
                    <Avatar className={cn(
                      'h-6 w-6 ring-2 transition-colors',
                      assigneeFilter === m.id
                        ? 'ring-primary'
                        : 'ring-background hover:ring-muted-foreground/40'
                    )}>
                      <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name} />
                      <AvatarFallback className="text-[9px]">{m.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Select-all row */}
      {filteredTasks.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 mb-1">
          <input
            type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size === filteredTasks.length}
            ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredTasks.length }}
            onChange={toggleSelectAll}
            className="cb-dark h-4 w-4"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} of ${filteredTasks.length} selected` : 'Select all'}
          </span>
        </div>
      )}

      {/* Priority groups */}
      <div className="flex-1 overflow-y-auto">
        {mounted ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {displayPriorities.map((priority) => (
              <PriorityGroup
                key={priority}
                priority={priority}
                tasks={grouped[priority]}
                onTaskClick={handleTaskClick}
                addingTo={addingToPriority === priority}
                onStartAdding={() => setAddingToPriority(priority)}
                onCreateTask={createTask}
                selectedIds={selectedIds}
                onToggleSelection={toggleSelection}
              />
            ))}
            <DragOverlay dropAnimation={null}>
              {activeDragId && (() => {
                const t = filteredTasks.find(x => x.id === activeDragId)
                if (!t) return null
                return (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border shadow-lg opacity-90">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground w-12 shrink-0">#{t.ticket_id}</span>
                    <span className="shrink-0" title={PRIORITY_CONFIG[t.priority].label}>
                      <PriorityIcon priority={t.priority} />
                    </span>
                    <span className="flex-1 text-sm font-medium truncate">{t.title}</span>
                    <Badge variant="secondary" className={cn('text-xs shrink-0', STATUS_CONFIG[t.status].className)}>
                      {STATUS_CONFIG[t.status].label}
                    </Badge>
                  </div>
                )
              })()}
            </DragOverlay>
          </DndContext>
        ) : (
          displayPriorities.map((priority) => {
            const cfg = PRIORITY_CONFIG[priority]
            const groupTasks = grouped[priority]
            return (
              <div key={priority} className="mb-4">
                <div className="flex items-center gap-2 py-1.5 px-1 w-full text-left">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  <span className={cn('text-sm font-medium flex items-center gap-1.5', cfg.color)}>
                    <PriorityIcon priority={priority} className="h-3.5 w-3.5" />
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">({groupTasks.length})</span>
                </div>
                <div className="ml-1">
                  {groupTasks.map((task) => {
                    const statusCfg = STATUS_CONFIG[task.status]
                    const visibleTags = (task.tags ?? []).slice(0, 2)
                    const extraTagCount = (task.tags ?? []).length - 2
                    return (
                      <div
                        key={task.id}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer border border-transparent hover:border-border transition-colors"
                        onClick={() => handleTaskClick(task)}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(task.id)}
                          onChange={() => toggleSelection(task.id)}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'cb-dark h-4 w-4 shrink-0',
                            selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          )}
                        />
                        <span className="w-4 shrink-0" />
                        <span className="text-xs text-muted-foreground w-12 shrink-0">#{task.ticket_id}</span>
                        {task.type && (
                          <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium shrink-0', TASK_TYPE_CONFIG[task.type].className)}>
                            {task.type}
                          </span>
                        )}
                        <span className="shrink-0" title={PRIORITY_CONFIG[task.priority].label}>
                          <PriorityIcon priority={task.priority} />
                        </span>
                        <span className={cn('flex-1 text-sm font-medium truncate', task.status === 'cancelled' && 'line-through text-muted-foreground/60')}>{task.title}</span>
                        <Badge variant="secondary" className={cn('text-xs shrink-0 hidden sm:inline-flex', statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                        <span className="hidden sm:inline-flex">
                          {task.assignee_id ? (
                            <ActorChip actorId={task.assignee_id} actorType={task.assignee_type as 'human' | 'agent'} compact />
                          ) : (
                            <span className="text-xs text-muted-foreground shrink-0">Unassigned</span>
                          )}
                        </span>
                        {task.due_date && (
                          <span className="text-xs text-muted-foreground shrink-0 hidden md:inline">
                            {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {visibleTags.length > 0 && (
                          <div className="hidden md:flex gap-1 shrink-0">
                            {visibleTags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">{tag}</Badge>
                            ))}
                            {extraTagCount > 0 && (
                              <span className="text-xs text-muted-foreground">+{extraTagCount}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}



        {filteredTasks.length === 0 && !addingToPriority && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No tasks found</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={handleNewTask}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create one
            </Button>
          </div>
        )}
      </div>

      {/* Task detail shelf */}
      {selectedTask && (
        <TaskModal task={selectedTask} onClose={handleShelfClose} />
      )}

      {/* Floating batch action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-3 max-w-[calc(100vw-2rem)]">
          <span className="text-sm text-zinc-300 font-medium whitespace-nowrap">
            {selectedIds.size} selected
          </span>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                batchUpdate({ status: e.target.value })
                e.target.value = ''
              }
            }}
            className="h-8 rounded-md border border-zinc-600 bg-zinc-700 px-2 text-sm text-zinc-200"
          >
            <option value="" disabled>Status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                batchUpdate({ priority: e.target.value })
                e.target.value = ''
              }
            }}
            className="h-8 rounded-md border border-zinc-600 bg-zinc-700 px-2 text-sm text-zinc-200"
          >
            <option value="" disabled>Priority</option>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>

          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value === 'unassign') {
                batchUpdate({ assignee_id: null, assignee_type: null })
                e.target.value = ''
              }
            }}
            className="h-8 rounded-md border border-zinc-600 bg-zinc-700 px-2 text-sm text-zinc-200"
          >
            <option value="" disabled>Assignee</option>
            <option value="unassign">Unassign</option>
          </select>

          <button
            onClick={batchDelete}
            className="h-8 px-3 rounded-md bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
          >
            Delete
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-zinc-700 transition-colors text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

    </div>
  )
}

