import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { AgentsClient } from './agents-client'

export default async function AdminAgentsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()

  return <AgentsClient currentUserName={profile?.full_name ?? user?.email ?? 'You'} currentUserId={user!.id} />
}
