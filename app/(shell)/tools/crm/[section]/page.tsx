import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CrmClient } from '../crm-client'

export default async function CrmSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  await requireAuth()
  const supabase = await createClient()

  const [{ data: companies }, { data: people }, { data: deals }] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('people').select('*').order('name'),
    supabase.from('deals').select('*').order('created_at', { ascending: false }),
  ])

  return (
    <Suspense fallback={null}>
      <CrmClient
        initialCompanies={companies ?? []}
        initialPeople={people ?? []}
        initialDeals={deals ?? []}
        initialSection={section}
      />
    </Suspense>
  )
}
