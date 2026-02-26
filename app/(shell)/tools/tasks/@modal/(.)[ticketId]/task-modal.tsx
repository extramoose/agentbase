'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityAndComments } from '@/components/activity-and-comments'

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
}

interface TaskData {
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

export function TaskModal({ task }: { task: TaskData }) {
  const router = useRouter()

  const close = useCallback(() => {
    router.back()
  }, [router])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={close}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full z-50 flex flex-col bg-card border-l border-border shadow-2xl w-[520px] max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold truncate">{task.title}</h2>
          <Button variant="ghost" size="icon" onClick={close} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">
            {/* Ticket number */}
            <p className="text-xs text-muted-foreground -mt-1">#{task.ticket_id}</p>

            {/* Status + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-0.5">Status</span>
                <span className="text-sm">{STATUS_LABELS[task.status] ?? task.status}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-0.5">Priority</span>
                <span className="text-sm">{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
              </div>
            </div>

            {/* Type */}
            {task.type && (
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-0.5">Type</span>
                <span className="text-sm capitalize">{task.type}</span>
              </div>
            )}

            {/* Due date */}
            {task.due_date && (
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-0.5">Due date</span>
                <span className="text-sm">{task.due_date}</span>
              </div>
            )}

            {/* Tags */}
            {task.tags && task.tags.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-1">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {task.body && (
              <div>
                <span className="text-xs text-muted-foreground font-medium block mb-1">Description</span>
                <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                  {task.body}
                </div>
              </div>
            )}
          </div>

          {/* Activity + comments */}
          <div className="border-t border-border">
            <ActivityAndComments entityType="tasks" entityId={task.id} />
          </div>
        </div>
      </div>
    </>
  )
}
