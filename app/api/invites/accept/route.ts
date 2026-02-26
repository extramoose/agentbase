import { requireAuthApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { token } = (await request.json()) as { token: string }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_accept_invite', { p_token: token })
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    const result = data as { tenant_id: string }
    return apiResponse({ tenant_id: result.tenant_id })
  } catch (err) {
    return apiError(err)
  }
}
