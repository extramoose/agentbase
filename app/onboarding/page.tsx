import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingClient } from './onboarding-client'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string }>
}) {
  await requireAuth()
  const { joined } = await searchParams

  // If joined via invite, skip workspace step — user already has a tenant
  if (joined === 'true') {
    return <OnboardingClient skipWorkspace />
  }

  // If user already has a tenant, skip onboarding entirely
  const supabase = await createClient()
  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
  if (tenantId) {
    redirect('/')
  }

  return <OnboardingClient />
}
