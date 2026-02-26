import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LibraryClient } from '../library-client'

export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAuth()
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })
  return (
    <Suspense fallback={null}>
      <LibraryClient initialItems={items ?? []} initialItemId={id} />
    </Suspense>
  )
}
