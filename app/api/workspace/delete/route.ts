import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { tenant_id, confirm_name } = await request.json()
    if (!tenant_id || !confirm_name) return Response.json({ error: 'tenant_id and confirm_name required' }, { status: 400 })
    const supabase = await createClient()
    const { error } = await supabase.rpc('rpc_delete_workspace', { p_tenant_id: tenant_id, p_confirm_name: confirm_name })
    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
