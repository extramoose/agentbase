import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(500),
})

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      ;({ data, error } = await supabase.rpc('rpc_list_essays', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase
        .from('essays')
        .select('*')
        .order('updated_at', { ascending: false }))
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

    const { data, error } = await supabase.rpc('rpc_create_essay', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_title: input.title,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
