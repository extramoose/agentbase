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

    const supabase = await createClient()

    // 1. Create workspace invite with email
    const { data, error } = await supabase.rpc('rpc_create_invite')
    if (error) throw new ApiError(error.message)
    const invite = data as { token: string; id: string }

    // 2. Store email on invite (migration 069 adds email column)
    // Using the caller's supabase client — RLS allows workspace members to manage invites
    await supabase
      .from('workspace_invites')
      .update({ email })
      .eq('id', invite.id)

    // TODO: store role on invite once role column is added
    void role

    // 3. Send magic link via Supabase auth (uses Resend SMTP)
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const origin = `${proto}://${host}`
    const redirectTo = `${origin}/invite/${invite.token}`

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (otpError) {
      console.error('OTP error:', otpError.message)
      throw new ApiError(`Failed to send invite: ${otpError.message}`)
    }

    return apiResponse({ id: invite.id, sent: true })
  } catch (err) {
    return apiError(err)
  }
}
