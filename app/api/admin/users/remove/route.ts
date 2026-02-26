import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    await requireAdminApi()
    const { user_id } = (await request.json()) as { user_id: string }
    const supabase = await createClient()
    const { error } = await supabase.rpc('rpc_remove_member', { p_user_id: user_id })
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    return apiResponse(null)
  } catch (err) {
    return apiError(err)
  }
}
