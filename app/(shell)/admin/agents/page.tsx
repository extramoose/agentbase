import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AgentsClient } from './agents-client'

export default async function AdminAgentsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: agentOwners } = await supabase
    .from('agent_owners')
    .select('agent_id, owner_id, created_at')

  const agentIds = (agentOwners ?? []).map(a => a.agent_id)
  const ownerIds = (agentOwners ?? []).map(a => a.owner_id)
  const allIds = [...new Set([...agentIds, ...ownerIds])]

  const { data: profiles } = allIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, created_at')
        .in('id', allIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const agents = (agentOwners ?? []).map(ao => {
    const agentProfile = profileMap.get(ao.agent_id)
    const ownerProfile = profileMap.get(ao.owner_id)
    return {
      id: ao.agent_id,
      email: agentProfile?.email ?? '',
      full_name: agentProfile?.full_name ?? null,
      avatar_url: agentProfile?.avatar_url ?? null,
      created_at: agentProfile?.created_at ?? ao.created_at,
      owner_name: ownerProfile?.full_name ?? ownerProfile?.email ?? 'Unknown',
    }
  })

  return <AgentsClient agents={agents} />
}
