import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    await requireAdminApi()
    const supabase = await createClient()

    // Use SECURITY DEFINER RPC — direct profiles SELECT hits recursive RLS
    const { data, error } = await supabase.rpc('get_workspace_members')
    if (error) return Response.json({ error: error.message }, { status: 400 })

    return Response.json({ data: data ?? [] })
  } catch (err) {
    return apiError(err)
  }
}
