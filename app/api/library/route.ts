import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const ITEM_TYPES = ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] as const

const createSchema = z.object({
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
})

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      ;({ data, error } = await supabase.rpc('rpc_list_library_items', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase
        .from('library_items')
        .select('*')
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
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
