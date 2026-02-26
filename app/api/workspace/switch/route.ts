import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { tenant_id } = await request.json()
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 })
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_switch_workspace', { p_tenant_id: tenant_id })
    if (error) throw error
    return Response.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
