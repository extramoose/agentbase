/**
 * scripts/generate-agent-sessions.ts
 *
 * Generates Supabase refresh tokens for Frank and Lucy agent accounts.
 * Run this after create-agent-users.ts.
 *
 * The Supabase JS client uses these refresh tokens to maintain authenticated
 * sessions automatically — no JWT signing, no manual refresh needed.
 *
 * Uses SUPABASE_SECRET_KEY — NEVER add this to Vercel or any runtime environment.
 *
 * Run from repo root:
 *   SUPABASE_SECRET_KEY=sb_secret_xxx npx tsx scripts/generate-agent-sessions.ts
 *
 * Copy the printed refresh tokens into each agent's config:
 *   Frank → openclaw.json env block: AGENTBASE_REFRESH_TOKEN=xxx
 *   Lucy  → her workspace config:    AGENTBASE_REFRESH_TOKEN=xxx
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function generateSession(email: string, name: string): Promise<void> {
  console.log(`\nGenerating session for ${name} (${email})...`)

  // Generate a magic link — this gives us a token we can exchange for a real session
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError) throw new Error(`generateLink failed for ${name}: ${linkError.message}`)

  // Extract the token from the generated link
  const url = new URL(linkData.properties.action_link)
  const token = url.searchParams.get('token')
  if (!token) throw new Error(`No token in magic link for ${name}`)

  // Exchange the token for a real session with refresh_token
  const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token,
    email,
  })
  if (sessionError) throw new Error(`verifyOtp failed for ${name}: ${sessionError.message}`)
  if (!sessionData.session) throw new Error(`No session returned for ${name}`)

  const { access_token, refresh_token } = sessionData.session

  console.log(`✅ ${name} session generated`)
  console.log(`   access_token (short-lived, for testing): ${access_token.slice(0, 20)}...`)
  console.log(`   refresh_token (store this): ${refresh_token}`)
  console.log(`\n   Add to ${name.toLowerCase()}'s config:`)
  console.log(`   AGENTBASE_REFRESH_TOKEN=${refresh_token}`)
}

async function main() {
  await generateSession('frank@internal.hah.to', 'Frank')
  await generateSession('lucy@internal.hah.to', 'Lucy')

  console.log('\n✅ All sessions generated.')
  console.log('\nAt runtime, agents initialize their Supabase client with:')
  console.log('  supabase.auth.setSession({ access_token, refresh_token })')
  console.log('The Supabase JS client auto-refreshes from there. No further scripts needed.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
