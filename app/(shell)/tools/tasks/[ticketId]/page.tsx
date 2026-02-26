import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

export default async function TaskPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(ticketId)
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq(isNumeric ? 'ticket_id' : 'id', isNumeric ? Number(ticketId) : ticketId)
    .single()

  if (!task) notFound()

  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <Link
        href="/tools/tasks"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to tasks
      </Link>

      <div className="space-y-6">
        <div>
          <p className="text-xs text-muted-foreground mb-1">#{task.ticket_id}</p>
          <h1 className="text-2xl font-bold">{task.title}</h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">Status</span>
            <span>{STATUS_LABELS[task.status] ?? task.status}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">Priority</span>
            <span>{PRIORITY_LABELS[task.priority] ?? task.priority}</span>
          </div>
          {task.type && (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Type</span>
              <span className="capitalize">{task.type}</span>
            </div>
          )}
          {task.due_date && (
            <div>
              <span className="text-xs text-muted-foreground block mb-0.5">Due date</span>
              <span>{task.due_date}</span>
            </div>
          )}
        </div>

        {task.tags && task.tags.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((tag: string) => (
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

        {task.body && (
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Description</span>
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
              {task.body}
            </div>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <ActivityAndComments entityType="tasks" entityId={task.id} />
        </div>
      </div>
    </div>
  )
}
