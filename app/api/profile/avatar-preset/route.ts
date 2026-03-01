import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError, ApiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  url: z.string().min(1).max(200),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType } = await resolveActorUnified(request)
    if (actorType !== 'human') {
      throw new ApiError('Only human users can set avatars', 403)
    }
    const body = await request.json()
    const { url } = schema.parse(body)
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: url })
      .eq('id', actorId)
    if (error) throw error
    return Response.json({ success: true, avatarUrl: url })
  } catch (err) {
    return apiError(err)
  }
}
