import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { HistoryClient } from './history-client'

export default async function HistoryPage() {
  await requireAuth()
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.rpc('get_activity_log', {
    p_limit: 50,
    p_offset: 0,
    p_date_from: today,
    p_date_to: today,
  })
  return <HistoryClient initialEntries={data ?? []} />
}
