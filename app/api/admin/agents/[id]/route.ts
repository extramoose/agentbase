import { createClient } from '@supabase/supabase-js'
import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    const { id } = await params

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Clean up agent_owners first, then remove from tenant_members
    await adminClient.from('agent_owners').delete().eq('agent_id', id)
    await adminClient.from('tenant_members').delete().eq('user_id', id)

    // Delete the auth user (invalidates all tokens)
    const { error } = await adminClient.auth.admin.deleteUser(id)
    if (error) throw new Error(error.message)

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
