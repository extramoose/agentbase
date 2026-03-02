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

  const supabase = await createClient()
  // If joined via invite, skip workspace step — user already has a tenant
  if (joined === 'true') {
    return <OnboardingClient skipWorkspace />
  }

  // If user already has a tenant, skip onboarding entirely
  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
  const { data: profile } = await supabase.rpc('get_my_profile_with_role')
  const hasName = profile && (profile as { full_name?: string }).full_name
  if (tenantId && hasName) {
    redirect('/')
  }

  return <OnboardingClient skipProfile={!!hasName} />
}
