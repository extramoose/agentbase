import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse, ApiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { headers } from 'next/headers'

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['member', 'admin']).default('member'),
})

export async function POST(request: Request) {
  try {
    await requireAdminApi()

    const body = await request.json()
    const { email, role } = schema.parse(body)

    // 1. Create workspace invite via RPC (uses caller's auth context for tenant)
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rpc_create_invite')
    if (error) throw new ApiError(error.message)
    const invite = data as { token: string; id: string }

    // 2. Store email on the invite record via admin client (bypasses RLS)
    const admin = createAdminClient()
    await admin
      .from('workspace_invites')
      .update({ email })
      .eq('id', invite.id)

    // TODO: store role on invite once role column is added to workspace_invites
    void role

    // 3. Send Supabase auth invite email with redirect to our invite page
    const h = await headers()
    const origin = h.get('origin') ?? h.get('x-forwarded-host') ?? ''
    const redirectTo = `${origin}/invite/${invite.token}`

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo }
    )
    if (inviteError) {
      // Clean up the invite if email send fails
      await admin
        .from('workspace_invites')
        .delete()
        .eq('id', invite.id)
      throw new ApiError(inviteError.message)
    }

    return apiResponse({ id: invite.id, token: invite.token })
  } catch (err) {
    return apiError(err)
  }
}
