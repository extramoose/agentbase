'use client'

import { useEffect, useState, useCallback } from 'react'
import { AvatarUpload } from '@/components/avatar-upload'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, Copy, Link, Loader2, Shield, ShieldAlert, Trash2, User } from 'lucide-react'

type Invite = {
  id: string
  token: string
  created_at: string
  accepted_by: string | null
  accepted_at: string | null
  revoked_at: string | null
}

type Member = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  joined_at: string
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  superadmin: { label: 'Super Admin', color: 'bg-yellow-500/20 text-yellow-400', icon: ShieldAlert },
  admin:      { label: 'Admin',       color: 'bg-blue-500/20 text-blue-400',   icon: Shield },
  user:       { label: 'User',        color: 'bg-muted text-muted-foreground', icon: User },
}

interface UsersClientProps {
  currentUserId: string
}

export function UsersClient({ currentUserId }: UsersClientProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Invite state
  const [invites, setInvites] = useState<Invite[]>([])
  const [generating, setGenerating] = useState(false)
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    const res = await fetch('/api/invites/list')
    const json = await res.json()
    if (res.ok) setInvites(json.data ?? [])
  }, [])

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (res.ok) setMembers(json.data ?? [])
      setLoading(false)
    }
    load()
    fetchInvites()
  }, [fetchInvites])

  const changeRole = useCallback(async (userId: string, newRole: 'user' | 'admin') => {
    // Optimistic update
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to update role')
      }
      toast({ type: 'success', message: `Role updated to ${newRole}` })
    } catch (err) {
      // Rollback
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (res.ok) setMembers(json.data ?? [])
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update role' })
    }
  }, [])

  const handleGenerateInvite = useCallback(async () => {
    setGenerating(true)
    setNewInviteUrl(null)
    try {
      const res = await fetch('/api/invites/create', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to generate invite')
      const url = `${window.location.origin}/invite/${json.data.token}`
      setNewInviteUrl(url)
      await fetchInvites()
      toast({ type: 'success', message: 'Invite link generated' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate invite' })
    } finally {
      setGenerating(false)
    }
  }, [fetchInvites])

  const handleRevokeInvite = useCallback(async (inviteId: string) => {
    try {
      const res = await fetch('/api/invites/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_id: inviteId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to revoke invite')
      await fetchInvites()
      toast({ type: 'success', message: 'Invite revoked' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke invite' })
    }
  }, [fetchInvites])

  const handleRemoveMember = useCallback(async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove member')
      setMembers(prev => prev.filter(m => m.id !== userId))
      toast({ type: 'success', message: 'Member removed' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to remove member' })
    }
  }, [])

  const pendingInvites = invites.filter(i => !i.accepted_at && !i.revoked_at)
  const acceptedInvites = invites.filter(i => i.accepted_at)

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">Users</h1>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.user
              const displayName = member.full_name ?? member.email.split('@')[0]
              const isSelf = member.id === currentUserId
              const isSuperadmin = member.role === 'superadmin'

              return (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarUpload
                        currentUrl={member.avatar_url}
                        name={displayName}
                        uploadUrl="/api/profile/avatar"
                        size="sm"
                        onSuccess={(newUrl) =>
                          setMembers(prev => prev.map(m =>
                            m.id === member.id ? { ...m, avatar_url: newUrl } : m
                          ))
                        }
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={config.color}>
                      {config.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span suppressHydrationWarning className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf || isSuperadmin ? (
                      <span className="text-xs text-muted-foreground">
                        {isSelf ? 'You' : '—'}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              Change role
                              <ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => changeRole(member.id, 'user')}
                              disabled={member.role === 'user'}
                            >
                              <User className="mr-2 h-4 w-4" />
                              User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => changeRole(member.id, 'admin')}
                              disabled={member.role === 'admin'}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Admin
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
        )}
      </div>

      {/* Invite Links */}
      <h2 className="text-lg font-semibold mt-8">Invite Links</h2>

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerateInvite} disabled={generating} size="sm">
          <Link className="mr-2 h-4 w-4" />
          {generating ? 'Generating...' : 'Generate invite link'}
        </Button>
      </div>

      {newInviteUrl && (
        <div className="flex items-center gap-2">
          <Input value={newInviteUrl} readOnly className="text-sm font-mono" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(newInviteUrl)
              toast({ type: 'success', message: 'Copied to clipboard' })
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {invite.token.slice(0, 8)}...
                  </code>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => handleRevokeInvite(invite.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {acceptedInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Accepted</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {acceptedInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {invite.token.slice(0, 8)}...
                  </code>
                  <span className="text-xs text-muted-foreground">
                    accepted by {invite.accepted_by?.slice(0, 8)}...
                  </span>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground">
                    {invite.accepted_at && formatDistanceToNow(new Date(invite.accepted_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
