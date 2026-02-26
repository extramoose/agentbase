'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EditShelf } from '@/components/edit-shelf'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'todo' | 'in_progress' | 'done' | 'blocked'

type Task = {
  id: string
  ticket_id: number
  title: string
  body: string | null
  status: Status
  priority: Priority
  tags: string[]
  due_date: string | null
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; icon: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-400', icon: '🔴' },
  high: { label: 'High', color: 'text-orange-400', icon: '🟠' },
  medium: { label: 'Medium', color: 'text-yellow-400', icon: '🟡' },
  low: { label: 'Low', color: 'text-blue-400', icon: '🔵' },
  none: { label: 'No priority', color: 'text-muted-foreground', icon: '⚪' },
}

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  todo: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/20 text-blue-400' },
  done: { label: 'Done', className: 'bg-green-500/20 text-green-400' },
  blocked: { label: 'Blocked', className: 'bg-red-500/20 text-red-400' },
}

const STATUS_TABS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
}: {
  task: Task
  onClick: () => void
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
  const priorityCfg = PRIORITY_CONFIG[task.priority]
  const visibleTags = task.tags.slice(0, 2)
  const extraTagCount = task.tags.length - 2

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border transition-colors"
      onClick={onClick}
    >
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

      {/* Priority dot */}
      <span className="shrink-0 text-sm" title={priorityCfg.label}>
        {priorityCfg.icon}
      </span>

      {/* Title */}
      <span className="flex-1 text-base truncate">{task.title}</span>

      {/* Status badge */}
      <Badge
        variant="secondary"
        className={cn('text-xs shrink-0', statusCfg.className)}
      >
        {statusCfg.label}
      </Badge>

      {/* Due date */}
      {task.due_date && (
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(task.due_date).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex gap-1 shrink-0">
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
  onDragEnd,
  addingTo,
  onStartAdding,
  onCreateTask,
}: {
  priority: Priority
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onDragEnd: (event: DragEndEvent, priority: Priority) => void
  addingTo: boolean
  onStartAdding: () => void
  onCreateTask: (title: string, priority: Priority) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cfg = PRIORITY_CONFIG[priority]

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

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
        className="flex items-center gap-2 py-2 px-1 w-full text-left hover:bg-muted/30 rounded-md transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <span className={cn('text-sm font-medium', cfg.color)}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground">({tasks.length})</span>
      </button>

      {!collapsed && (
        <div className="ml-1">
          {/* Quick-add input */}
          {addingTo && (
            <div className="flex items-center gap-2 px-3 py-2">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDragEnd(e, priority)}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {tasks.length === 0 && !addingTo && (
            <button
              onClick={onStartAdding}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
}: {
  initialTasks: Task[]
  currentUser: CurrentUser
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addingToPriority, setAddingToPriority] = useState<Priority | null>(null)

  const supabase = createClient()

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
          setSelectedTask((prev) => (prev?.id === updated.id ? updated : prev))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setTasks((prev) => prev.filter((t) => t.id !== deletedId))
          setSelectedTask((prev) => (prev?.id === deletedId ? null : prev))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // ----- Filtered & grouped tasks -----

  const filteredTasks = useMemo(() => {
    let result = tasks

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    }

    return result
  }, [tasks, statusFilter, search])

  const grouped = useMemo(() => groupByPriority(filteredTasks), [filteredTasks])

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
        tags: [],
        due_date: null,
        sort_order: 0,
        source_meeting_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setTasks((prev) => [optimistic, ...prev])
      setAddingToPriority(null)

      try {
        const res = await fetch('/api/tasks', {
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
      setSelectedTask((prev) =>
        prev?.id === taskId
          ? { ...prev, ...fields, updated_at: new Date().toISOString() } as Task
          : prev
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

  // ----- Delete task -----

  const deleteTask = useCallback(
    async (taskId: string) => {
      const prev = tasks
      setTasks((t) => t.filter((x) => x.id !== taskId))
      setSelectedTask(null)

      try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        toast({ type: 'success', message: 'Task deleted' })
      } catch (err) {
        setTasks(prev)
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Delete failed',
        })
      }
    },
    [tasks]
  )

  // ----- Drag reorder within priority group -----

  const handleDragEnd = useCallback(
    (event: DragEndEvent, priority: Priority) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const group = grouped[priority]
      const oldIndex = group.findIndex((t) => t.id === active.id)
      const newIndex = group.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(group, oldIndex, newIndex)

      // Update local state
      setTasks((prev) => {
        const otherTasks = prev.filter((t) => t.priority !== priority)
        const updated = reordered.map((t, i) => ({ ...t, sort_order: i }))
        return [...otherTasks, ...updated]
      })

      // Persist new sort_order for the moved task
      const movedTask = reordered[newIndex]
      updateTaskField(movedTask.id, { sort_order: newIndex })
    },
    [grouped, updateTaskField]
  )

  // ----- New task button -----

  function handleNewTask() {
    const priority: Priority =
      statusFilter === 'all' ? 'medium' : 'medium'
    setAddingToPriority(priority)
  }

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
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold shrink-0">Tasks</h1>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search tasks..."
            className="flex-1 max-w-lg"
          />
          <Button size="sm" onClick={handleNewTask}>
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? tasks.length
              : tasks.filter((t) => t.status === tab.value).length
          return (
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
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Priority groups */}
      <div className="flex-1 overflow-y-auto">
        {displayPriorities.map((priority) => (
          <PriorityGroup
            key={priority}
            priority={priority}
            tasks={grouped[priority]}
            onTaskClick={(task) => setSelectedTask(task)}
            onDragEnd={handleDragEnd}
            addingTo={addingToPriority === priority}
            onStartAdding={() => setAddingToPriority(priority)}
            onCreateTask={createTask}
          />
        ))}

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

      {/* EditShelf */}
      {selectedTask && (
        <TaskEditShelf
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTaskField}
          onDelete={deleteTask}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit shelf for a single task
// ---------------------------------------------------------------------------

function TaskEditShelf({
  task,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task
  onClose: () => void
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(task.title)
  const [body, setBody] = useState(task.body ?? '')
  const [status, setStatus] = useState<Status>(task.status)
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [tags, setTags] = useState<string[]>(task.tags)

  // Sync when task prop changes (from realtime)
  useEffect(() => {
    setTitle(task.title)
    setBody(task.body ?? '')
    setStatus(task.status)
    setPriority(task.priority)
    setDueDate(task.due_date ?? '')
    setTags(task.tags)
  }, [task])

  // Debounced field save
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function saveField(fields: Record<string, unknown>) {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      onUpdate(task.id, fields)
    }, 500)
  }

  function saveFieldImmediate(fields: Record<string, unknown>) {
    clearTimeout(saveTimeout.current)
    onUpdate(task.id, fields)
  }

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title={`Task #${task.ticket_id}`}
      entityType="tasks"
      entityId={task.id}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(task.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Title
          </label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              saveField({ title: e.target.value })
            }}
            className="text-base font-medium"
          />
        </div>

        {/* Status + Priority row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => {
                const val = e.target.value as Status
                setStatus(val)
                saveFieldImmediate({ status: val })
              }}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            >
              {(Object.keys(STATUS_CONFIG) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => {
                const val = e.target.value as Priority
                setPriority(val)
                saveFieldImmediate({ priority: val })
              }}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_CONFIG[p].icon} {PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Description
          </label>
          <RichTextEditor
            value={body}
            onBlur={(md) => {
              setBody(md)
              saveField({ body: md })
            }}
            placeholder="Add details..."
            minHeight="120px"
          />
        </div>

        {/* Due date */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Due date
          </label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value)
              saveFieldImmediate({
                due_date: e.target.value || null,
              })
            }}
            className="text-sm"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">
            Tags
          </label>
          <TagCombobox
            selected={tags}
            onChange={(newTags) => {
              setTags(newTags)
              saveFieldImmediate({ tags: newTags })
            }}
          />
        </div>
      </div>
    </EditShelf>
  )
}
