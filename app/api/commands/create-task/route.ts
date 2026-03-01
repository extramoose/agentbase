import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { validateAssignee } from '@/lib/api/validate-assignee'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(500),
  priority: z
    .enum(['urgent', 'high', 'medium', 'low', 'none'])
    .optional()
    .default('medium'),
  status: z
    .enum(['backlog', 'todo', 'in_progress', 'blocked', 'done', 'cancelled'])
    .optional()
    .default('todo'),
  body: z.string().optional(),
  assignee_id: z.union([z.string().uuid(), z.literal('unassigned')]).default('unassigned'),
  type: z.enum(['bug', 'improvement', 'feature']).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  due_date: z.string().optional().nullable(),
  idempotency_key: z.string().max(128).optional(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      // If assignee_id is the problem, fetch members and return helpful error
      const assigneeIssue = parsed.error.issues.find((i) =>
        i.path.includes('assignee_id'),
      )
      if (assigneeIssue) {
        const result = await validateAssignee(supabase, tenantId, body?.assignee_id)
        if (!result.valid) {
          return Response.json(
            { error: result.error, valid_assignees: result.valid_assignees },
            { status: 400 },
          )
        }
      }
      // Re-throw for other validation errors
      throw parsed.error
    }

    const input = parsed.data

    const assigneeResult = await validateAssignee(supabase, tenantId, input.assignee_id)
    if (!assigneeResult.valid) {
      return Response.json(
        { error: assigneeResult.error, valid_assignees: assigneeResult.valid_assignees },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('rpc_create_task', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_title: input.title,
      p_priority: input.priority,
      p_status: input.status,
      p_body: input.body ?? null,
      p_assignee_id: assigneeResult.assignee_id,
      p_assignee_type: assigneeResult.assignee_type,
      p_type: input.type ?? null,
      p_tags: input.tags.length > 0 ? input.tags.map(t => t.toLowerCase()) : null,
      p_due_date: input.due_date ?? null,
      p_idempotency_key: input.idempotency_key ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
