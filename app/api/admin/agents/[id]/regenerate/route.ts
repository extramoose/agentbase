import { createClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/auth'
import { apiError, ApiError } from '@/lib/api/errors'
import { randomBytes, createHash } from 'crypto'

/** POST — regenerate API key for an agent */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    const { id } = await params
    const supabase = await createClient()

    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, name, revoked_at')
      .eq('id', id)
      .single()

    if (fetchError || !agent) {
      throw new ApiError('Agent not found', 404)
    }

    if (agent.revoked_at) {
      throw new ApiError('Cannot regenerate key for a revoked agent', 409)
    }

    const plainKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(plainKey).digest('hex')

    const { error: updateError } = await supabase
      .from('agents')
      .update({ api_key_hash: keyHash })
      .eq('id', id)

    if (updateError) throw new Error(updateError.message)

    return Response.json({ success: true, api_key: plainKey })
  } catch (err) {
    return apiError(err)
  }
}
