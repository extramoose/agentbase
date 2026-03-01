import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AgentsClient } from './agents-client'

export default async function AdminAgentsPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Get current user's tenant to scope query (defense-in-depth alongside RLS)
  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, avatar_url, owner_id, last_seen_at, revoked_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Get owner profiles
  const ownerIds = [...new Set((agents ?? []).map(a => a.owner_id))]
  const { data: owners } = ownerIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', ownerIds)
    : { data: [] }
  const ownerMap = new Map((owners ?? []).map(p => [p.id, p]))

  const agentsWithOwners = (agents ?? []).map(a => ({
    ...a,
    owner_name: ownerMap.get(a.owner_id)?.full_name ?? ownerMap.get(a.owner_id)?.email ?? 'Unknown',
  }))

  // Get current user for the client
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user!.id).single()

  return <AgentsClient agents={agentsWithOwners} currentUserName={profile?.full_name ?? user?.email ?? 'You'} currentUserId={user!.id} isOwner={profile?.role === 'owner'} />
}
