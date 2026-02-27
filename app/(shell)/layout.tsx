import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MobileShell } from '@/components/mobile-shell'
import { CmdK } from '@/components/cmd-k'

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()

  const supabase = await createClient()
  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
  if (!tenantId) {
    redirect('/onboarding')
  }

  const { data: workspaces } = await supabase.rpc('rpc_list_my_workspaces')

  return (
    <>
      <MobileShell profile={profile} workspaces={workspaces ?? []}>
        {children}
      </MobileShell>
      <CmdK />
    </>
  )
}
