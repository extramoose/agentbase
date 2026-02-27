import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const ALLOWED_ENTITY_TYPES = ['tasks', 'library_items', 'companies', 'people', 'deals'] as const

const schema = z.object({
  source_type: z.enum(ALLOWED_ENTITY_TYPES),
  source_id:   z.string().uuid(),
  target_type: z.enum(ALLOWED_ENTITY_TYPES),
  target_id:   z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_entity_link', {
      p_tenant_id:   tenantId,
      p_actor_id:    actorId,
      p_source_type: input.source_type,
      p_source_id:   input.source_id,
      p_target_type: input.target_type,
      p_target_id:   input.target_id,
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json(data)
  } catch (err) {
    return apiError(err)
  }
}
