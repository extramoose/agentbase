import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TasksClient } from '../tasks-client'
import { TaskShelfOverlay } from '@/app/(shell)/@shelf/(.)tasks/[id]/task-shelf-overlay'

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(id)

  const [{ data: tasks }, { data: selectedTask }, { data: profile }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .eq(isNumeric ? 'ticket_id' : 'id', isNumeric ? Number(id) : id)
      .single(),
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, active_tenant_id')
      .eq('id', user.id)
      .single(),
  ])

  if (!selectedTask) notFound()

  const workspaceId = profile?.active_tenant_id ?? ''

  return (
    <>
      <Suspense fallback={null}>
        <TasksClient
          initialTasks={tasks ?? []}
          currentUser={profile}
          workspaceId={workspaceId}
        />
      </Suspense>
      <TaskShelfOverlay task={selectedTask} />
    </>
  )
}
