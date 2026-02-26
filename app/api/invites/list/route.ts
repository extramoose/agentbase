import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    await requireAdminApi()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_list_invites')
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    return apiResponse(data ?? [])
  } catch (err) {
    return apiError(err)
  }
}
