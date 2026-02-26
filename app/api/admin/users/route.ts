import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await getUserProfile()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  const { data: members, error: membersError } = await supabase
    .from('tenant_members')
    .select('user_id, role, joined_at')
    .order('joined_at', { ascending: true })

  if (membersError) return Response.json({ error: membersError.message }, { status: 400 })
  if (!members || members.length === 0) return Response.json({ data: [] })

  const userIds = members.map(m => m.user_id)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role, created_at')
    .in('id', userIds)

  if (profilesError) return Response.json({ error: profilesError.message }, { status: 400 })

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  const data = members
    .filter(m => m.role !== 'agent')
    .map(m => {
      const p = profileMap.get(m.user_id)
      return {
        id: m.user_id,
        email: p?.email ?? '',
        full_name: p?.full_name ?? null,
        avatar_url: p?.avatar_url ?? null,
        role: p?.role ?? 'user',
        joined_at: m.joined_at,
      }
    })

  return Response.json({ data })
}
