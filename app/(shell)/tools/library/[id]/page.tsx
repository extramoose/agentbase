import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { LibraryClient } from '../library-client'

export default async function LibraryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(id)

  const { data: items } = await supabase
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })

  // Validate the entity exists when using seq_id
  if (isNumeric) {
    const { data: entity } = await supabase
      .from('library_items')
      .select('id')
      .eq('seq_id', Number(id))
      .single()
    if (!entity) notFound()
  }

  return (
    <Suspense fallback={null}>
      <LibraryClient initialItems={items ?? []} initialItemId={id} />
    </Suspense>
  )
}
