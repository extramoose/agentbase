'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTaskFilters } from '@/hooks/use-task-filters'
import { PageHeader } from '@/components/page-header'
import { StickiesView } from '@/components/stickies-view'
import { type Task } from '@/app/(shell)/tasks/tasks-client'
import { Button } from '@/components/ui/button'
import { Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { AssigneePicker } from '@/components/assignee-picker'
import { TagCombobox } from '@/components/tag-combobox'
import { RichTextEditor } from '@/components/rich-text-editor'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
type TaskType = 'bug' | 'improvement' | 'feature'

type CurrentUser = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string
  active_tenant_id?: string | null
} | null

const STATUS_ORDER: Status[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled']
const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']

const STATUS_CONFIG: Record<Status, { label: string }> = {
  backlog: { label: 'Backlog' },
  todo: { label: 'To Do' },
  in_progress: { label: 'In Progress' },
  blocked: { label: 'Blocked' },
  done: { label: 'Done' },
  cancelled: { label: 'Cancelled' },
}

const PRIORITY_CONFIG: Record<Priority, { label: string }> = {
  urgent: { label: 'Urgent' },
  high: { label: 'High' },
  medium: { label: 'Medium' },
  low: { label: 'Low' },
  none: { label: 'No priority' },
}

const TASK_TYPE_CONFIG: Record<TaskType, { label: string }> = {
  bug: { label: 'bug' },
  improvement: { label: 'improvement' },
  feature: { label: 'feature' },
}

// ---------------------------------------------------------------------------
// New task shelf (reused pattern from tasks-client)
// ---------------------------------------------------------------------------

function NewTaskShelf({
  onCreated,
  onClose,
  currentUserId,
}: {
  onCreated: (task: Task) => void
  onClose: () => void
  currentUserId?: string
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [status, setStatus] = useState<Status>('todo')
  const [assigneeId, setAssigneeId] = useState<string | null>(currentUserId ?? null)
  const [assigneeType, setAssigneeType] = useState<string | null>(currentUserId ? 'human' : null)
  const [tags, setTags] = useState<string[]>([])
  const [dueDate, setDueDate] = useState<string>('')
  const [taskType, setTaskType] = useState<TaskType | ''>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/commands/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          body: body || undefined,
          priority,
          status,
          assignee_id: assigneeId ?? 'unassigned',
          tags,
          due_date: dueDate || undefined,
          type: taskType || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create task')
      const created = json.data as Task
      toast({ type: 'success', message: 'Task created' })
      onCreated(created)
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create task',
      })
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 flex flex-col',
          'bg-card border-l border-border shadow-2xl',
          'w-full sm:w-[480px] sm:max-w-full',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">New Task</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-5">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
                }}
                placeholder="Task title"
                className="text-base font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Assignee</label>
              <AssigneePicker
                value={assigneeId ? { id: assigneeId, type: assigneeType as 'human' | 'agent' } : null}
                onChange={(actor) => {
                  setAssigneeId(actor?.id ?? null)
                  setAssigneeType(actor?.type ?? null)
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Due Date</label>
                <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">Type</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType | '')}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  <option value="">None</option>
                  {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Description</label>
              <RichTextEditor
                value={body}
                onBlur={(md) => setBody(md)}
                placeholder="Add details..."
                minHeight="120px"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
              <TagCombobox selected={tags} onChange={setTags} />
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-border shrink-0">
          <Button onClick={handleSave} disabled={!title.trim() || saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? 'Creating...' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard client
// ---------------------------------------------------------------------------

export function DashboardClient({
  initialTasks,
  currentUser,
  workspaceId,
}: {
  initialTasks: Task[]
  currentUser: CurrentUser
  workspaceId: string
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set())
  const [creatingTask, setCreatingTask] = useState(false)
  const router = useRouter()

  const {
    facePile,
    toggleFacePile,
    filters,
    setFilters,
    hasActiveFilters,
    clearFilters,
    dashboardView,
    setDashboardView,
    workspaceMembers,
    applyFilters,
  } = useTaskFilters(workspaceId, currentUser?.id)

  const supabase = createClient()

  // --- Realtime subscription ---
  useEffect(() => {
    const channel = supabase
      .channel('dashboard:tasks:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        (payload) => {
          const newTask = payload.new as Task
          setTasks((prev) => {
            if (prev.some((t) => t.id === newTask.id)) return prev
            const tempIdx = prev.findIndex(
              (t) => t.id.startsWith('temp-') && t.title === newTask.title
            )
            if (tempIdx !== -1) {
              const next = [...prev]
              next[tempIdx] = newTask
              return next
            }
            return [...prev, newTask]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        (payload) => {
          const updated = payload.new as Task
          setTasks((prev) => {
            const old = prev.find(t => t.id === updated.id)
            if (old && old.status !== updated.status) {
              setRecentlyChanged(s => { const n = new Set(s); n.add(updated.id); return n })
              setTimeout(() => setRecentlyChanged(s => { const n = new Set(s); n.delete(updated.id); return n }), 3000)
            }
            return prev.map((t) => (t.id === updated.id ? updated : t))
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setTasks((prev) => prev.filter((t) => t.id !== deletedId))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Agent broadcast sidecar ---
  useEffect(() => {
    const channel = supabase
      .channel('dashboard:agent:mutations')
      .on('broadcast', { event: 'mutation' }, (msg) => {
        const { table } = msg.payload as { table: string }
        if (table !== 'tasks') return
        supabase
          .from('tasks')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false })
          .then(({ data }) => {
            if (data) setTasks(data as Task[])
          })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Apply filters ---
  const filteredTasks = useMemo(() => applyFilters(tasks), [tasks, applyFilters])

  const taskHref = useCallback((task: { id: string; ticket_id?: number }) => {
    const full = tasks.find((t) => t.id === task.id)
    return `/tasks/${full?.ticket_id ?? task.ticket_id}`
  }, [tasks])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        workspaceMembers={workspaceMembers}
        facePile={facePile}
        onToggleFacePile={toggleFacePile}
        showViewToggle
        dashboardView={dashboardView}
        onDashboardViewChange={setDashboardView}
        filters={filters}
        onFiltersChange={setFilters}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onNewTask={() => setCreatingTask(true)}
      />

      <StickiesView
        tasks={filteredTasks}
        taskHref={taskHref}
        mode={dashboardView}
        recentlyChanged={recentlyChanged}
      />

      {/* New task creation shelf */}
      {creatingTask && (
        <NewTaskShelf
          currentUserId={currentUser?.id}
          onClose={() => setCreatingTask(false)}
          onCreated={(created) => {
            setTasks((prev) =>
              prev.some((t) => t.id === created.id) ? prev : [created, ...prev]
            )
            setCreatingTask(false)
            // Open the task shelf via intercepting route
            router.push(`/tasks/${created.ticket_id}`)
          }}
        />
      )}
    </div>
  )
}
