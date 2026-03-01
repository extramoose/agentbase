import { requireAuthApi } from '@/lib/auth'
import { apiError, apiResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    await requireAuthApi()
    const { token } = (await request.json()) as { token: string }
    const supabase = await createClient()

    // Check if user already has a workspace before accepting
    const { data: existingTenant } = await supabase.rpc('get_my_tenant_id')
    const hadWorkspace = !!existingTenant

    const { data, error } = await supabase.rpc('rpc_accept_invite', { p_token: token })
    if (error) return Response.json({ success: false, error: error.message }, { status: 400 })
    const result = data as { tenant_id: string }

    // Fetch the workspace name for the toast
    const { data: workspaces } = await supabase.rpc('rpc_list_my_workspaces')
    const joined = (workspaces as { tenant_id: string; name: string }[] | null)?.find(
      (t) => t.tenant_id === result.tenant_id,
    )

    return apiResponse({
      tenant_id: result.tenant_id,
      workspace_name: joined?.name ?? null,
      had_workspace: hadWorkspace,
    })
  } catch (err) {
    return apiError(err)
  }
}
