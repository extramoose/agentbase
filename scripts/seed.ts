/**
 * scripts/seed.ts
 *
 * Creates the initial HunterTenant workspace and sets Hunter's profile
 * role to 'superadmin'. Run this once after Hunter signs in for the first time.
 *
 * Uses SUPABASE_SECRET_KEY — scripts only, never runtime.
 *
 * Run from repo root:
 *   SUPABASE_SECRET_KEY=sb_secret_xxx HUNTER_USER_ID=xxx npx tsx scripts/seed.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const HUNTER_USER_ID = process.env.HUNTER_USER_ID

if (!SUPABASE_URL || !SECRET_KEY || !HUNTER_USER_ID) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, HUNTER_USER_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  // 1. Create HunterTenant
  console.log('Creating HunterTenant...')
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({ name: 'HunterTenant' })
    .select()
    .single()
  if (tenantError) throw new Error(`Tenant creation failed: ${tenantError.message}`)
  console.log(`  ✓ Tenant created: ${tenant.id}`)

  // 2. Add Hunter as superadmin member
  console.log('Adding Hunter as superadmin...')
  const { error: memberError } = await supabase
    .from('tenant_members')
    .insert({ tenant_id: tenant.id, user_id: HUNTER_USER_ID, role: 'superadmin' })
  if (memberError) throw new Error(`tenant_members insert failed: ${memberError.message}`)
  console.log('  ✓ Hunter added as superadmin')

  // 3. Upgrade Hunter's profile role
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'superadmin' })
    .eq('id', HUNTER_USER_ID)
  if (profileError) throw new Error(`Profile update failed: ${profileError.message}`)
  console.log('  ✓ Profile role set to superadmin')

  console.log('\n✅ Seed complete!')
  console.log(`   TENANT_ID=${tenant.id}`)
  console.log('\nNext: run create-agent-users.ts with this TENANT_ID and HUNTER_USER_ID.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
