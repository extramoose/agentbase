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
import { Check, ChevronDown, Copy, Link, Loader2, Shield, ShieldAlert, Trash2, User } from 'lucide-react'

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
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

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
    setMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m))
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update role')
      toast({ type: 'success', message: `Role updated to ${newRole}` })
    } catch (err) {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (res.ok) setMembers(json.data ?? [])
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update role' })
    }
  }, [])

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

  const handleGenerateInvite = useCallback(async () => {
    setGenerating(true)
    setCopied(false)
    setInviteUrl(null)
    try {
      const res = await fetch('/api/invites/create', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create invite')
      const token = json.data?.token ?? json.token
      setInviteUrl(`${window.location.origin}/invite/${token}`)
      await fetchInvites()
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create invite' })
    } finally {
      setGenerating(false)
    }
  }, [fetchInvites])

  const handleCopy = useCallback(() => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast({ type: 'success', message: 'Copied to clipboard' })
    setTimeout(() => setCopied(false), 2000)
  }, [inviteUrl])

  const pendingInvites = invites.filter(i => !i.accepted_at && !i.revoked_at)

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
                      <div>
                        <p className="text-sm font-medium">{displayName}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={`text-xs ${config.color}`}>
                      <config.icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span suppressHydrationWarning className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!isSelf && !isOwner && (
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              Role <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => changeRole(member.id, 'member')}>
                              Member
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => changeRole(member.id, 'admin')}>
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

      {/* Invite link */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Invite</h2>
        <p className="text-sm text-muted-foreground">Generate a one-time invite link to share with someone.</p>

        <div className="flex items-center gap-2">
          {inviteUrl ? (
            <>
              <Input value={inviteUrl} readOnly className="text-sm font-mono" />
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerateInvite} disabled={generating} size="sm" className="h-9">
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link className="mr-2 h-4 w-4" />
              )}
              Generate invite link
            </Button>
          )}
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending invites</h3>
          <div className="rounded-lg border border-border divide-y divide-border">
            {pendingInvites.map(invite => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-3">
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
    </div>
  )
}
