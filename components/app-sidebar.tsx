'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CheckSquare,
  BookOpen,
  Users,
  Clock,
  UserCog,
  Bot,
  Settings,
  LogOut,
  ChevronsUpDown,
  Check,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { AvatarUpload } from '@/components/avatar-upload'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  { label: 'Library', href: '/tools/library', icon: BookOpen },
  { label: 'CRM', href: '/tools/crm', icon: Users },
  { label: 'History', href: '/history', icon: Clock },
]

const adminItems = [
  { label: 'Users', href: '/admin/users', icon: UserCog },
  { label: 'Agents', href: '/admin/agents', icon: Bot },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export function AppSidebar({ profile, workspaces, onNavigate }: { profile: UserProfile | null; workspaces: Workspace[]; onNavigate?: () => void }) {
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
      window.location.href = '/tools/tasks'
    } finally {
      setSwitching(false)
    }
  }

  const [dialogOpen, setDialogOpen] = useState<'create' | 'rename' | 'delete' | 'leave' | null>(null)
  const [dialogInput, setDialogInput] = useState('')
  const [dialogLoading, setDialogLoading] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const activeWorkspace = workspaces.find((w) => w.is_active)

  const tenantRole = activeWorkspace?.role
  const isOwnerOrAdmin = tenantRole === 'owner' || tenantRole === 'admin'
  const isOwner = tenantRole === 'owner'
  const canLeave = tenantRole === 'admin' || tenantRole === 'member'
  const isAdmin =
    tenantRole === 'admin' || tenantRole === 'owner' || profile?.role === 'owner'

  function openDialog(type: 'create' | 'rename' | 'delete' | 'leave') {
    setDialogInput(type === 'rename' ? activeWorkspace?.name ?? '' : '')
    setDialogError('')
    setDialogLoading(false)
    setDialogOpen(type)
  }

  function closeDialog() {
    setDialogOpen(null)
    setDialogInput('')
    setDialogError('')
  }

  async function handleCreateWorkspace() {
    if (!dialogInput.trim()) return
    setDialogLoading(true)
    setDialogError('')
    try {
      const res = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dialogInput.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to create workspace')
      }
      closeDialog()
      router.refresh()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleRenameWorkspace() {
    if (!dialogInput.trim() || !activeWorkspace) return
    setDialogLoading(true)
    setDialogError('')
    try {
      const res = await fetch('/api/workspace/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: activeWorkspace.tenant_id, name: dialogInput.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to rename workspace')
      }
      closeDialog()
      router.refresh()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return
    setDialogLoading(true)
    setDialogError('')
    try {
      const res = await fetch('/api/workspace/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: activeWorkspace.tenant_id, confirm_name: dialogInput }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to delete workspace')
      }
      closeDialog()
      router.refresh()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleLeaveWorkspace() {
    if (!activeWorkspace) return
    setDialogLoading(true)
    setDialogError('')
    try {
      const res = await fetch('/api/workspace/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: activeWorkspace.tenant_id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to leave workspace')
      }
      closeDialog()
      router.refresh()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDialogLoading(false)
    }
  }

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
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
              onClick={onNavigate}
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
                  onClick={onNavigate}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openDialog('create')}>
                  <Plus className="h-4 w-4" />
                  New workspace
                </DropdownMenuItem>
                {isOwnerOrAdmin && (
                  <DropdownMenuItem onClick={() => openDialog('rename')}>
                    <Pencil className="h-4 w-4" />
                    Rename
                  </DropdownMenuItem>
                )}
                {canLeave && (
                  <DropdownMenuItem onClick={() => openDialog('leave')}>
                    <LogOut className="h-4 w-4" />
                    Leave workspace
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => openDialog('delete')}>
                      <Trash2 className="h-4 w-4" />
                      Delete workspace
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      <Separator />

      <div className="flex items-center gap-3 p-4">
        <AvatarUpload
          currentUrl={profile?.avatar_url ?? null}
          name={profile?.full_name ?? profile?.email ?? 'User'}
          uploadUrl="/api/profile/avatar"
          size="sm"
        />
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

      {/* Create workspace dialog */}
      <Dialog open={dialogOpen === 'create'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Create a new workspace to organize your team.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ws-create-name">Name</Label>
            <Input
              id="ws-create-name"
              value={dialogInput}
              onChange={(e) => setDialogInput(e.target.value)}
              placeholder="Workspace name"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
            />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleCreateWorkspace} disabled={dialogLoading || !dialogInput.trim()}>
              {dialogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename workspace dialog */}
      <Dialog open={dialogOpen === 'rename'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename workspace</DialogTitle>
            <DialogDescription>Change the name of &ldquo;{activeWorkspace?.name}&rdquo;.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ws-rename-name">Name</Label>
            <Input
              id="ws-rename-name"
              value={dialogInput}
              onChange={(e) => setDialogInput(e.target.value)}
              placeholder="New name"
              onKeyDown={(e) => e.key === 'Enter' && handleRenameWorkspace()}
            />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleRenameWorkspace} disabled={dialogLoading || !dialogInput.trim()}>
              {dialogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete workspace dialog */}
      <Dialog open={dialogOpen === 'delete'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Type <strong>{activeWorkspace?.name}</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ws-delete-confirm">Workspace name</Label>
            <Input
              id="ws-delete-confirm"
              value={dialogInput}
              onChange={(e) => setDialogInput(e.target.value)}
              placeholder={activeWorkspace?.name}
              onKeyDown={(e) => e.key === 'Enter' && dialogInput === activeWorkspace?.name && handleDeleteWorkspace()}
            />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkspace}
              disabled={dialogLoading || dialogInput !== activeWorkspace?.name}
            >
              {dialogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave workspace dialog */}
      <Dialog open={dialogOpen === 'leave'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave workspace</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave &ldquo;{activeWorkspace?.name}&rdquo;? You will lose access unless re-invited.
            </DialogDescription>
          </DialogHeader>
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button variant="destructive" onClick={handleLeaveWorkspace} disabled={dialogLoading}>
              {dialogLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
