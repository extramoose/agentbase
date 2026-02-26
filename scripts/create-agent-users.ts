/**
 * scripts/create-agent-users.ts
 *
 * One-time setup script. Creates Frank and Lucy as real Supabase Auth users,
 * then registers them as agents (agent_owners) and workspace members (tenant_members).
 *
 * Uses SUPABASE_SECRET_KEY — NEVER add this to Vercel or any runtime environment.
 *
 * Run from repo root:
 *   SUPABASE_SECRET_KEY=sb_secret_xxx HUNTER_USER_ID=xxx TENANT_ID=xxx npx tsx scripts/create-agent-users.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const HUNTER_USER_ID = process.env.HUNTER_USER_ID   // Hunter's auth.users UUID (after he signs in)
const TENANT_ID = process.env.TENANT_ID              // HunterTenant UUID from tenants table

if (!SUPABASE_URL || !SECRET_KEY || !HUNTER_USER_ID || !TENANT_ID) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, HUNTER_USER_ID, TENANT_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function createAgentUser(email: string, name: string): Promise<string> {
  console.log(`Creating agent user: ${name} (${email})`)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, is_agent: true },
  })
  if (error) throw new Error(`Failed to create ${name}: ${error.message}`)
  console.log(`  ✓ Created ${name}: ${data.user.id}`)
  return data.user.id
}

async function main() {
  // Create agent users
  const frankId = await createAgentUser('frank@internal.hah.to', 'Frank')
  const lucyId  = await createAgentUser('lucy@internal.hah.to', 'Lucy')

  // Register in agent_owners (maps agent → human owner)
  console.log('\nRegistering agent ownership...')
  const { error: ownerError } = await supabase.from('agent_owners').insert([
    { agent_id: frankId, owner_id: HUNTER_USER_ID },
    { agent_id: lucyId,  owner_id: HUNTER_USER_ID },
  ])
  if (ownerError) throw new Error(`agent_owners insert failed: ${ownerError.message}`)
  console.log('  ✓ agent_owners registered')

  // Add agents to the workspace as members with role = 'agent'
  console.log('\nAdding agents to workspace...')
  const { error: memberError } = await supabase.from('tenant_members').insert([
    { tenant_id: TENANT_ID, user_id: frankId, role: 'agent' },
    { tenant_id: TENANT_ID, user_id: lucyId,  role: 'agent' },
  ])
  if (memberError) throw new Error(`tenant_members insert failed: ${memberError.message}`)
  console.log('  ✓ tenant_members registered')

  console.log('\n✅ Done! Agent UUIDs:')
  console.log(`  FRANK_USER_ID=${frankId}`)
  console.log(`  LUCY_USER_ID=${lucyId}`)
  console.log('\nNext: run scripts/generate-agent-sessions.ts with these UUIDs to get refresh tokens.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
