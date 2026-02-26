import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_upsert_diary_entry', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_date: input.date,
      p_content: input.content,
    })
    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
