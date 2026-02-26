import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    await requireAdminApi()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_create_invite')
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    const invite = data as { token: string; id: string }
    return apiResponse({ token: invite.token, id: invite.id })
  } catch (err) {
    return apiError(err)
  }
}
