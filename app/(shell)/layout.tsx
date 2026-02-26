import { getUserProfile } from '@/lib/auth'
import { AppSidebar } from '@/components/app-sidebar'
import { CmdK } from '@/components/cmd-k'

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getUserProfile()

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
