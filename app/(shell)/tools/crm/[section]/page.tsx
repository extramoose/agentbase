import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { CrmClient } from '../crm-client'

export default async function CrmSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { section } = await params
  const sp = await searchParams
  await requireAuth()
  const supabase = await createClient()

  const [{ data: companies }, { data: people }, { data: deals }] = await Promise.all([
    supabase.from('companies').select('*').is('deleted_at', null).order('name'),
    supabase.from('people').select('*').is('deleted_at', null).order('name'),
    supabase.from('deals').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
  ])

  const idParam = typeof sp.id === 'string' ? Number(sp.id) : undefined
  const initialSelectedId = idParam && !isNaN(idParam) ? idParam : undefined

  return (
    <Suspense fallback={null}>
      <CrmClient
        initialCompanies={companies ?? []}
        initialPeople={people ?? []}
        initialDeals={deals ?? []}
        initialSection={section}
        initialSelectedId={initialSelectedId}
      />
    </Suspense>
  )
}
