import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CrmClient } from '../../crm-client'

export default async function CrmDetailPage({ params }: { params: Promise<{ section: string; id: string }> }) {
  const { section, id } = await params
  await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(id)

  const [{ data: companies }, { data: people }, { data: deals }] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('people').select('*').order('name'),
    supabase.from('deals').select('*').order('created_at', { ascending: false }),
  ])

  // Resolve the initialId: if numeric, find the entity by seq_id and pass its seq_id as the initialId
  // The CrmClient will match by seq_id when the id is numeric
  let resolvedId = id
  if (isNumeric) {
    const numId = Number(id)
    const table = section === 'companies' ? 'companies' : section === 'people' ? 'people' : 'deals'
    const { data: entity } = await supabase
      .from(table)
      .select('id')
      .eq('seq_id', numId)
      .single()
    if (!entity) notFound()
    resolvedId = id // keep numeric string — CrmClient handles seq_id lookup
  }

  return (
    <Suspense fallback={null}>
      <CrmClient
        initialCompanies={companies ?? []}
        initialPeople={people ?? []}
        initialDeals={deals ?? []}
        initialSection={section}
        initialId={resolvedId}
      />
    </Suspense>
  )
}
