import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TasksClient } from '../tasks-client'

export default async function TaskDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  const user = await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(ticketId)

  const [{ data: tasks }, { data: selectedTask }, { data: profile }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .eq(isNumeric ? 'ticket_id' : 'id', isNumeric ? Number(ticketId) : ticketId)
      .single(),
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .eq('id', user.id)
      .single(),
  ])

  if (!selectedTask) notFound()

  return (
    <Suspense fallback={null}>
      <TasksClient
        initialTasks={tasks ?? []}
        currentUser={profile}
        initialSelectedTask={selectedTask}
      />
    </Suspense>
  )
}
