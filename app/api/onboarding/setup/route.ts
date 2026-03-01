import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

function starterTasks() {
  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  return [
    { title: 'Add your first agent', priority: 'urgent', tags: ['onboarding'], due_date: today },
    { title: 'Invite a teammate', priority: 'high', tags: ['onboarding'], due_date: today },
    { title: 'Create your first task', priority: 'medium', tags: ['onboarding'], due_date: tomorrow },
  ] as const
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthApi()
    const { name } = await request.json()
    if (!name?.trim()) {
      return Response.json({ error: 'Workspace name is required' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_setup_workspace', {
      p_workspace_name: name.trim(),
    })
    if (error) throw error

    // Create starter tasks
    const tenantId = (data as { tenant_id: string }).tenant_id ?? data
    for (const task of starterTasks()) {
      await supabase.rpc('rpc_create_task', {
        p_tenant_id: tenantId,
        p_actor_id: user.id,
        p_actor_type: 'human',
        p_title: task.title,
        p_priority: task.priority,
        p_status: 'todo',
        p_body: null,
        p_assignee_id: user.id,
        p_assignee_type: 'human',
        p_type: null,
        p_tags: [...task.tags],
        p_due_date: task.due_date,
        p_idempotency_key: null,
      })
    }

    return Response.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
