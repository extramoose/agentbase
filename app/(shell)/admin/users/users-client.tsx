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
import { Check, ChevronDown, Loader2, Mail, Shield, ShieldAlert, Trash2, User } from 'lucide-react'

type Invite = {
  id: string
  token: string
  email: string | null
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
  owner:  { label: 'Owner',  color: 'bg-yellow-500/20 text-yellow-400', icon: ShieldAlert },
  admin:  { label: 'Admin',  color: 'bg-blue-500/20 text-blue-400',     icon: Shield },
  member: { label: 'Member', color: 'bg-muted text-muted-foreground',   icon: User },
}

interface UsersClientProps {
  currentUserId: string
}

export function UsersClient({ currentUserId }: UsersClientProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  // Invite state
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

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

  const changeRole = useCallback(async (userId: string, newRole: 'member' | 'admin') => {
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

  const handleSendEmailInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setSent(false)
    try {
      const res = await fetch('/api/invites/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send invite')
      setSent(true)
      setInviteEmail('')
      setInviteRole('member')
      await fetchInvites()
      toast({ type: 'success', message: `Invite sent to ${inviteEmail}` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send invite' })
    } finally {
      setSending(false)
    }
  }, [inviteEmail, inviteRole, fetchInvites])

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
              const config = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.member
              const displayName = member.full_name ?? member.email.split('@')[0]
              const isSelf = member.id === currentUserId
              const isOwner = member.role === 'owner'

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
                    {isSelf || isOwner ? (
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
                              onClick={() => changeRole(member.id, 'member')}
                              disabled={member.role === 'member'}
                            >
                              <User className="mr-2 h-4 w-4" />
                              Member
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

      {/* Invite */}
      <h2 className="text-lg font-semibold mt-8">Invite</h2>

      <form onSubmit={handleSendEmailInvite} className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex-1 w-full sm:w-auto">
          <label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground mb-1 block">
            Email address
          </label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={e => { setInviteEmail(e.target.value); setSent(false) }}
            required
          />
        </div>
        <div className="w-full sm:w-[140px]">
          <label htmlFor="invite-role" className="text-xs font-medium text-muted-foreground mb-1 block">
            Role
          </label>
          <select
            id="invite-role"
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as 'member' | 'admin')}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <Button type="submit" disabled={sending || !inviteEmail} size="sm" className="h-9">
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : sent ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {sending ? 'Sending...' : sent ? 'Sent' : 'Send invite'}
        </Button>
      </form>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending invites</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                  {invite.email ? (
                    <span className="text-sm">{invite.email}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Link invite</span>
                  )}
                  <Badge variant="secondary" className="text-xs">Pending</Badge>
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

      {/* Accepted Invites */}
      {acceptedInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Accepted invites</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {acceptedInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
                  {invite.email ? (
                    <span className="text-sm">{invite.email}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Link invite</span>
                  )}
                  <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">Accepted</Badge>
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
