import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { tenant_id, name } = await request.json()
    if (!tenant_id || !name) return Response.json({ error: 'tenant_id and name required' }, { status: 400 })
    const supabase = await createClient()
    const { error } = await supabase.rpc('rpc_rename_workspace', { p_tenant_id: tenant_id, p_name: name })
    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
