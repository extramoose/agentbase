import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { MeetingsClient } from './meetings-client'

export default async function MeetingsPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .eq('id', user.id)
    .single()

  return <MeetingsClient initialMeetings={meetings ?? []} currentUser={profile} />
}
