import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { EssaysClient } from './essays-client'

export default async function EssaysPage() {
  await requireAuth()
  const supabase = await createClient()
  const { data: essays } = await supabase
    .from('essays')
    .select('*')
    .order('updated_at', { ascending: false })
  return (
    <Suspense fallback={null}>
      <EssaysClient initialEssays={essays ?? []} />
    </Suspense>
  )
}
