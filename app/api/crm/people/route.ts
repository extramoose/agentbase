import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(500),
  email: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      ;({ data, error } = await supabase.rpc('rpc_list_people', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase.from('people').select('*').order('name'))
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

    const { data, error } = await supabase.rpc('rpc_create_person', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_name: input.name,
      p_email: input.email ?? null,
      p_phone: input.phone ?? null,
      p_title: input.title ?? null,
      p_notes: input.notes ?? null,
      p_tags: input.tags,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
