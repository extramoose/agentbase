import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { validateAssignee } from '@/lib/api/validate-assignee'
import { broadcastMutation } from '@/lib/api/broadcast'

const ALLOWED_TABLES = [
  'tasks', 'library_items', 'companies', 'people', 'deals',
] as const

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  id: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()),
})

export async function PATCH(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    // Validate assignee_id when updating tasks
    if (input.table === 'tasks' && 'assignee_id' in input.fields) {
      const rawAssigneeId = input.fields.assignee_id

      // Allow explicit null (clearing assignee)
      if (rawAssigneeId === null) {
        // Also auto-clear assignee_type
        input.fields.assignee_type = null
      } else {
        const assigneeResult = await validateAssignee(
          supabase,
          tenantId,
          rawAssigneeId as string,
        )
        if (!assigneeResult.valid) {
          return NextResponse.json(
            { error: assigneeResult.error, valid_assignees: assigneeResult.valid_assignees },
            { status: 400 },
          )
        }
        input.fields.assignee_id = assigneeResult.assignee_id
        input.fields.assignee_type = assigneeResult.assignee_type
      }
    }

    // Normalize tags to lowercase on update
    if ('tags' in input.fields && Array.isArray(input.fields.tags)) {
      input.fields.tags = (input.fields.tags as string[]).map(t => t.toLowerCase())
    }

    // Strip task-only fields from non-task tables
    if (input.table !== 'tasks') {
      delete input.fields.assignee_id
      delete input.fields.assignee_type
    }

    const { data, error } = await supabase.rpc('rpc_update_entity', {
      p_table: input.table,
      p_entity_id: input.id,
      p_fields: input.fields,
      p_actor_id: actorId,
      p_tenant_id: tenantId,
    })

    if (error) throw error
    if (actorType === 'agent') {
      broadcastMutation(supabase, input.table, 'UPDATE', input.id)
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
