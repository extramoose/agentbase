'use client'

import { ANON_AVATAR_URL } from '@/lib/constants'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CheckSquare,
  Calendar,
  BookOpen,
  BookText,
  PenTool,
  ShoppingCart,
  Users,
  Clock,
  UserCog,
  Bot,
  Settings,
  LogOut,
  ChevronsUpDown,
  Check,
  Loader2,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/lib/auth'
import { useState } from 'react'

export type Workspace = {
  tenant_id: string
  name: string
  role: string
  is_active: boolean
}

const navItems = [
  { label: 'Tasks', href: '/tools/tasks', icon: CheckSquare },
  { label: 'Meetings', href: '/tools/meetings', icon: Calendar },
  { label: 'Library', href: '/tools/library', icon: BookOpen },
  { label: 'Diary', href: '/tools/diary', icon: BookText },
  { label: 'Essays', href: '/tools/essays', icon: PenTool },
  { label: 'Grocery', href: '/tools/grocery', icon: ShoppingCart },
  { label: 'CRM', href: '/tools/crm', icon: Users },
  { label: 'History', href: '/history', icon: Clock },
]

const adminItems = [
  { label: 'Users', href: '/admin/users', icon: UserCog },
  { label: 'Agents', href: '/admin/agents', icon: Bot },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export function AppSidebar({ profile, workspaces }: { profile: UserProfile | null; workspaces: Workspace[] }) {
  const pathname = usePathname()
  const router = useRouter()
  const [switching, setSwitching] = useState(false)

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/sign-in')
  }

  async function handleSwitchWorkspace(tenantId: string) {
    setSwitching(true)
    try {
      const res = await fetch('/api/workspace/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      if (!res.ok) throw new Error('Failed to switch workspace')
      router.refresh()
    } finally {
      setSwitching(false)
    }
  }

  const activeWorkspace = workspaces.find((w) => w.is_active)
  const hasMultipleWorkspaces = workspaces.length > 1

  const tenantRole = activeWorkspace?.role
  const isAdmin =
    tenantRole === 'admin' || tenantRole === 'superadmin' || profile?.role === 'superadmin'

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : profile?.email?.[0]?.toUpperCase() ?? 'U'

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="text-lg font-bold text-foreground">
          AgentBase
        </Link>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-2 py-2">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {isAdmin && (
          <>
            <Separator className="my-3" />

            <div className="px-3 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </ScrollArea>

      {workspaces.length > 0 && (
        <>
          <Separator />
          <div className="px-3 py-2">
            {hasMultipleWorkspaces ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                    disabled={switching}
                  >
                    <span className="truncate">
                      {switching ? 'Switching…' : activeWorkspace?.name ?? 'Workspace'}
                    </span>
                    {switching ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {workspaces.map((ws) => (
                    <DropdownMenuItem
                      key={ws.tenant_id}
                      onClick={() => {
                        if (!ws.is_active) handleSwitchWorkspace(ws.tenant_id)
                      }}
                    >
                      <Check className={cn('h-4 w-4 shrink-0', ws.is_active ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 truncate">{ws.name}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        {ws.role}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <p className="truncate px-2 py-1.5 text-sm font-medium text-muted-foreground">
                {activeWorkspace?.name ?? 'Workspace'}
              </p>
            )}
          </div>
        </>
      )}

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile?.avatar_url ?? ANON_AVATAR_URL} alt={profile?.full_name ?? 'User'} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate">
          <p className="text-sm font-medium text-foreground truncate">
            {profile?.full_name ?? profile?.email ?? 'User'}
          </p>
          {profile?.full_name && profile.email && (
            <p className="text-xs text-muted-foreground truncate">
              {profile.email}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
