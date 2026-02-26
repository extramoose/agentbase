import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './settings-client'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .limit(1)
    .single()

  const supabaseProjectId = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
    : 'unknown'

  return (
    <SettingsClient
      workspaceName={tenant?.name ?? 'Unknown'}
      supabaseProjectId={supabaseProjectId}
    />
  )
}
