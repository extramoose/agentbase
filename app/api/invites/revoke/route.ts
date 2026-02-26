import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    await requireAdminApi()
    const { invite_id } = (await request.json()) as { invite_id: string }
    const supabase = await createClient()
    const { error } = await supabase.rpc('rpc_revoke_invite', { p_invite_id: invite_id })
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    return apiResponse(null)
  } catch (err) {
    return apiError(err)
  }
}
