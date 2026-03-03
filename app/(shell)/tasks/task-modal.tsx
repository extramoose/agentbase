'use client'

import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui/date-input'
import { ActivityAndComments } from '@/components/activity-and-comments'
import { AssigneePicker } from '@/components/assignee-picker'
import { TagCombobox } from '@/components/tag-combobox'
import { RichTextEditor } from '@/components/rich-text-editor'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'

// ---------------------------------------------------------------------------
// Config (mirrors tasks-client.tsx)
// ---------------------------------------------------------------------------

type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
type TaskType = 'bug' | 'improvement' | 'feature'

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none']
const STATUS_ORDER: Status[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled']

const PRIORITY_CONFIG: Record<Priority, { label: string }> = {
  urgent: { label: 'Urgent' },
  high: { label: 'High' },
  medium: { label: 'Medium' },
  low: { label: 'Low' },
  none: { label: 'No priority' },
}

const STATUS_CONFIG: Record<Status, { label: string }> = {
  backlog: { label: 'Backlog' },
  todo: { label: 'To Do' },
  in_progress: { label: 'In Progress' },
  blocked: { label: 'Blocked' },
  done: { label: 'Done' },
  cancelled: { label: 'Cancelled' },
}

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; className: string }> = {
  bug: { label: 'bug', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  improvement: { label: 'improvement', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  feature: { label: 'feature', className: 'bg-violet-500/20 text-violet-400 border border-violet-500/30' },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskData {
  id: string
  ticket_id: number
  title: string
  body: string | null
  status: string
  priority: string
  type: string | null
  tags: string[] | null
  due_date: string | null
  assignee_id: string | null
  assignee_type: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskModal({ task, onClose }: { task: TaskData; onClose: () => void }) {
  // Local state for all editable fields
  const [title, setTitle] = useState(task.title)
  const [status, setStatus] = useState<Status>(task.status as Status)
  const [priority, setPriority] = useState<Priority>(task.priority as Priority)
  const [taskType, setTaskType] = useState<TaskType | null>(task.type as TaskType | null)
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee_id)
  const [assigneeType, setAssigneeType] = useState<string | null>(task.assignee_type)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [tags, setTags] = useState<string[]>(task.tags ?? [])
  const [body, setBody] = useState(task.body ?? '')

  // Reset local state when task prop changes (e.g. selecting a different task)
  useEffect(() => {
    setTitle(task.title)
    setStatus(task.status as Status)
    setPriority(task.priority as Priority)
    setTaskType(task.type as TaskType | null)
    setAssigneeId(task.assignee_id)
    setAssigneeType(task.assignee_type)
    setDueDate(task.due_date ?? '')
    setTags(task.tags ?? [])
    setBody(task.body ?? '')
  }, [task.id, task.title, task.status, task.priority, task.type, task.assignee_id, task.assignee_type, task.due_date, task.tags, task.body])

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Save helper
  async function saveField(fields: Record<string, unknown>) {
    try {
      const res = await fetch('/api/commands/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'tasks', id: task.id, fields }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Update failed')
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Update failed',
      })
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    try {
      const res = await fetch('/api/commands/delete-entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'tasks', id: task.id }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Delete failed')
      }
      onClose()
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Delete failed',
      })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full z-50 flex flex-col bg-card border-l border-border shadow-2xl w-full sm:w-[520px] sm:max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-5">
            {/* Ticket number */}
            <p className="text-xs text-muted-foreground -mt-1">#{task.ticket_id}</p>

            {/* Title */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => saveField({ title: e.target.value })}
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
                    saveField({ status: val })
                  }}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  {STATUS_ORDER.map((s) => (
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
                    saveField({ priority: val })
                  }}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_CONFIG[p].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Type
              </label>
              <div className="flex gap-1.5">
                {([null, 'bug', 'improvement', 'feature'] as const).map((t) => {
                  const isSelected = taskType === t
                  return (
                    <button
                      key={t ?? 'none'}
                      onClick={() => {
                        setTaskType(t)
                        saveField({ type: t })
                      }}
                      className={cn(
                        'rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                        isSelected
                          ? t === null
                            ? 'bg-zinc-700 text-zinc-200 border border-zinc-600'
                            : TASK_TYPE_CONFIG[t].className
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      )}
                    >
                      {t === null ? 'None' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Assignee
              </label>
              <AssigneePicker
                value={assigneeId ? { id: assigneeId, type: assigneeType as 'human' | 'agent' } : null}
                onChange={(actor) => {
                  setAssigneeId(actor?.id ?? null)
                  setAssigneeType(actor?.type ?? null)
                  saveField({
                    assignee_id: actor?.id ?? null,
                    assignee_type: actor?.type ?? null,
                  })
                }}
              />
            </div>

            {/* Description */}
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
              <DateInput
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value)
                  saveField({ due_date: e.target.value || null })
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
                  saveField({ tags: newTags })
                }}
              />
            </div>
          </div>

          {/* Activity + comments */}
          <div className="border-t border-border">
            <ActivityAndComments entityType="tasks" entityId={task.id} noCollapse />
          </div>
        </div>
      </div>
    </>
  )
}
