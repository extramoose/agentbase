'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { AppSidebar, type Workspace } from '@/components/app-sidebar'
import type { UserProfile } from '@/lib/auth'

interface MobileShellProps {
  profile: UserProfile | null
  workspaces: Workspace[]
  children: React.ReactNode
}

export function MobileShell({ profile, workspaces, children }: MobileShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Close on Escape
  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [sidebarOpen])

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar — visible only below sm */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center gap-3 border-b border-border bg-card px-3 sm:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold text-foreground">AgentBase</span>
      </div>

      {/* Backdrop — mobile only, when sidebar is open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-60 transition-transform duration-200 ease-in-out
          sm:static sm:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <AppSidebar profile={profile} workspaces={workspaces} onNavigate={closeSidebar} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-3 pt-15 sm:p-6 sm:pt-6">
        {children}
      </main>
    </div>
  )
}
