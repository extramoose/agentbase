import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const ITEM_TYPES = ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] as const

const schema = z.object({
  type: z.enum(ITEM_TYPES),
  title: z.string().min(1).max(500),
  url: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  location_name: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  is_public: z.boolean().optional().default(false),
  idempotency_key: z.string().max(128).optional(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_create_library_item', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_type: input.type,
      p_title: input.title,
      p_url: input.url ?? null,
      p_body: input.body ?? null,
      p_source: input.source ?? null,
      p_excerpt: input.excerpt ?? null,
      p_location_name: input.location_name ?? null,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_tags: input.tags,
      p_is_public: input.is_public,
      p_idempotency_key: input.idempotency_key ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
