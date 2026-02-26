import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { name } = await request.json()
    if (!name?.trim()) {
      return Response.json({ error: 'Workspace name is required' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_setup_workspace', {
      p_workspace_name: name.trim(),
    })
    if (error) throw error
    return Response.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
