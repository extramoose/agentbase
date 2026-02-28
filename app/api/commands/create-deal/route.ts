import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(500),
  status: z
    .enum(['prospect', 'active', 'won', 'lost'])
    .optional()
    .default('prospect'),
  value: z.number().nullable().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  idempotency_key: z.string().max(128).optional(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_deal', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_title: input.title,
      p_status: input.status,
      p_value: input.value ?? null,
      p_notes: input.notes ?? null,
      p_tags: input.tags.map(t => t.toLowerCase()),
      p_idempotency_key: input.idempotency_key ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
