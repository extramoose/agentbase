import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LibraryClient } from './library-client'

export default async function LibraryPage() {
  await requireAuth()
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('library_items')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return (
    <Suspense fallback={null}>
      <LibraryClient initialItems={items ?? []} />
    </Suspense>
  )
}
