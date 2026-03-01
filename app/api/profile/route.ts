import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError, ApiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  full_name: z.string().min(1).max(200).optional(),
})

export async function PATCH(request: Request) {
  try {
    const { supabase, actorId, actorType } = await resolveActorUnified(request)
    if (actorType !== 'human') {
      throw new ApiError('Only human users can edit profiles', 403)
    }
    const body = await request.json()
    const fields = schema.parse(body)
    const { error } = await supabase
      .from('profiles')
      .update(fields)
      .eq('id', actorId)
    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
