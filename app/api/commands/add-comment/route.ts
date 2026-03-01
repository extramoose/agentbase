import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { broadcastMutation } from '@/lib/api/broadcast'

const schema = z.object({
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  entity_label: z.string().optional(),
  body: z.string().min(1).max(50000),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_add_comment', {
      p_entity_type: input.entity_type,
      p_entity_id: input.entity_id,
      p_entity_label: input.entity_label ?? null,
      p_body: input.body,
      p_actor_id: actorId,
      p_tenant_id: tenantId,
    })

    if (error) throw error
    if (actorType === 'agent') {
      broadcastMutation(supabase, 'activity_log', 'INSERT', input.entity_id)
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
