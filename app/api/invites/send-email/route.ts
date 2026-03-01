import { requireAdminApi } from '@/lib/auth'
import { apiError, apiResponse, ApiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
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

    // 2. Build the invite URL
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const origin = `${proto}://${host}`
    const inviteUrl = `${origin}/invite/${invite.token}?email=${encodeURIComponent(email)}`

    // 3. Send email via Resend API (no service_role needed)
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AgentBase <noreply@hah.to>',
          to: [email],
          subject: 'You\'ve been invited to AgentBase',
          text: `You've been invited to join a workspace on AgentBase.

Accept your invite: ${inviteUrl}`,
        }),
      })
      if (!emailRes.ok) {
        const errBody = await emailRes.text()
        console.error('Resend error:', errBody)
        // Don't throw — still return the link as fallback
      }
    }

    // TODO: store role on invite once role column is added to workspace_invites
    void role

    return apiResponse({ id: invite.id, token: invite.token, url: inviteUrl, email_sent: !!resendKey })
  } catch (err) {
    return apiError(err)
  }
}
