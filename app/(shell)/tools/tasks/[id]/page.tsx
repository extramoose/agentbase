import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TasksClient } from '../tasks-client'

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('id', user.id)
    .single()

  return (
    <Suspense fallback={null}>
      <TasksClient initialTasks={tasks ?? []} currentUser={profile} initialTaskId={id} />
    </Suspense>
  )
}
