import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z
    .enum(['urgent', 'high', 'medium', 'low', 'none'])
    .optional()
    .default('medium'),
  status: z
    .enum(['todo', 'in_progress', 'done', 'blocked'])
    .optional()
    .default('todo'),
  body: z.string().optional(),
  assignee_id: z.string().uuid().optional().nullable(),
  assignee_type: z.enum(['human', 'agent']).optional().nullable(),
  type: z.enum(['bug', 'improvement', 'feature']).optional().nullable(),
})

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      // Agent anon client has no JWT → auth.uid() null → RLS fails; use SECURITY DEFINER RPC
      ;({ data, error } = await supabase.rpc('rpc_list_tasks', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }))
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = createSchema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_task', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_title: input.title,
      p_priority: input.priority,
      p_status: input.status,
      p_body: input.body ?? null,
      p_assignee_id: input.assignee_id ?? null,
      p_assignee_type: input.assignee_type ?? null,
      p_type: input.type ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
