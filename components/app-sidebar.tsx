'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CheckSquare,
  Calendar,
  BookOpen,
  BookText,
  ShoppingCart,
  Users,
  Clock,
  UserCog,
  Bot,
  Settings,
  LogOut,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Tasks', href: '/tools/tasks', icon: CheckSquare },
  { label: 'Meetings', href: '/tools/meetings', icon: Calendar },
  { label: 'Library', href: '/tools/library', icon: BookOpen },
  { label: 'Diary', href: '/tools/diary', icon: BookText },
  { label: 'Grocery', href: '/tools/grocery', icon: ShoppingCart },
  { label: 'CRM', href: '/tools/crm/companies', icon: Users },
  { label: 'History', href: '/history', icon: Clock },
]

const adminItems = [
  { label: 'Users', href: '/admin/users', icon: UserCog },
  { label: 'Agents', href: '/admin/agents', icon: Bot },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }

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
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

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
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
        <div className="flex-1 truncate">
          <p className="text-sm font-medium text-foreground">User</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
