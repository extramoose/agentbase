import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1).max(500),
  category: z.string().max(200).optional(),
  quantity: z.string().max(100).optional(),
  idempotency_key: z.string().max(128).optional(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_grocery_item', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_name: input.name,
      p_category: input.category ?? null,
      p_quantity: input.quantity ?? null,
      p_idempotency_key: input.idempotency_key ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
