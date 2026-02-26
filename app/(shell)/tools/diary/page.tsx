import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DiaryClient } from './diary-client'

export default async function DiaryPage() {
  await requireAuth()
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data: entry } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('date', today)
    .single()
  return <DiaryClient initialEntry={entry ?? null} initialDate={today} />
}
