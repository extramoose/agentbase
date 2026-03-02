import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InviteClient } from './invite-client'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const user = await getCurrentUser()

  if (!user) {
    // Fetch invite preview for the sign-in page context
    const supabase = await createClient()
    const { data } = await supabase.rpc('rpc_invite_preview', { p_token: token })
    const preview = data as { valid: boolean; workspace_name?: string; inviter_name?: string } | null

    const params = new URLSearchParams({ invite_token: token })
    if (preview?.valid) {
      if (preview.workspace_name) params.set('workspace', preview.workspace_name)
      if (preview.inviter_name) params.set('inviter', preview.inviter_name)
    }
    redirect(`/sign-in?${params.toString()}`)
  }

  return <InviteClient token={token} />
}
