import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { DiaryClient } from '../diary-client'

export default async function DiaryDatePage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  await requireAuth()
  const { date } = await params
  const supabase = await createClient()

  // Fetch existing entry for this date (may be null)
  const { data: entry } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('date', date)
    .single()

  return <DiaryClient entry={entry ?? null} date={date} />
}
