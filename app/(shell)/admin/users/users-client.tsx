'use client'

import { useEffect, useState, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Check, ChevronDown, Loader2, Pencil, Shield, ShieldAlert, User, X } from 'lucide-react'

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

  // Avatar editing state
  const [editingAvatar, setEditingAvatar] = useState<string | null>(null)
  const [avatarDraft, setAvatarDraft] = useState('')
  const [savingAvatar, setSavingAvatar] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/users')
      const json = await res.json()
      if (res.ok) setMembers(json.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

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

  const handleSaveAvatar = useCallback(async (userId: string) => {
    setSavingAvatar(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: avatarDraft.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update avatar')

      setMembers(prev => prev.map(m =>
        m.id === userId ? { ...m, avatar_url: avatarDraft.trim() || null } : m
      ))
      setEditingAvatar(null)
      toast({ type: 'success', message: 'Avatar updated' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update avatar' })
    } finally {
      setSavingAvatar(false)
    }
  }, [avatarDraft])

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="rounded-lg border border-border">
        <table className="w-full">
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
              const initials = displayName.slice(0, 2).toUpperCase()
              const isSelf = member.id === currentUserId
              const isSuperadmin = member.role === 'superadmin'
              const isEditingAvatar = editingAvatar === member.id

              return (
                <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative group">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar_url ?? undefined} alt={displayName} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        {!isEditingAvatar && (
                          <button
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { setEditingAvatar(member.id); setAvatarDraft(member.avatar_url ?? '') }}
                          >
                            <Pencil className="h-3 w-3 text-white" />
                          </button>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        {isEditingAvatar && (
                          <div className="flex items-center gap-1 mt-1">
                            <Input
                              className="h-6 text-xs"
                              placeholder="Avatar URL"
                              value={avatarDraft}
                              onChange={e => setAvatarDraft(e.target.value)}
                              disabled={savingAvatar}
                            />
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleSaveAvatar(member.id)}
                              disabled={savingAvatar}
                            >
                              {savingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setEditingAvatar(null)}
                              disabled={savingAvatar}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={config.color}>
                      {config.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf || isSuperadmin ? (
                      <span className="text-xs text-muted-foreground">
                        {isSelf ? 'You' : '—'}
                      </span>
                    ) : (
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
    </div>
  )
}
