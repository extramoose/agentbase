import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, active_tenant_id')
    .eq('id', user.id)
    .single()

  const workspaceId = profile?.active_tenant_id ?? ''

  return (
    <Suspense fallback={null}>
      <TasksClient initialTasks={tasks ?? []} currentUser={profile} workspaceId={workspaceId} />
    </Suspense>
  )
}
