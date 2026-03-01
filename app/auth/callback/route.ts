import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'email' | 'magiclink' | null
  const next = searchParams.get('next') ?? '/'

  const supabase = await createClient()

  // Magic link flow
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
    }
  }
  // OAuth / PKCE flow
  else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
    }
  }
  // No auth params
  else {
    return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`)
  }

  // Check if user has a workspace
  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
  if (!tenantId) {
    return NextResponse.redirect(`${origin}/onboarding`)
  }
  return NextResponse.redirect(`${origin}${next}`)
}
