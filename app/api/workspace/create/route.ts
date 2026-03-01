import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { name } = await request.json()
    if (!name) return Response.json({ error: 'name required' }, { status: 400 })
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_create_workspace', { p_name: name })
    if (error) throw error
    return Response.json({ success: true, tenant_id: data })
  } catch (err) {
    return apiError(err)
  }
}
