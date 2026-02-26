import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
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

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar profile={profile} />
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
      <CmdK />
    </div>
  )
}
