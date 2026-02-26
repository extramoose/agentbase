import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './settings-client'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: settings } = await supabase.rpc('get_workspace_settings')

  const supabaseProjectId = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
    : 'unknown'

  return (
    <SettingsClient
      settings={settings as Record<string, unknown> | null}
      supabaseProjectId={supabaseProjectId}
    />
  )
}
