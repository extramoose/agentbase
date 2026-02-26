'use client'

import { useState, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { Bot, Check, Copy, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

type Agent = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  owner_name: string
}

interface AgentsClientProps {
  agents: Agent[]
  currentUserName: string
}

const OWNER_ID = '86f74cef-4a09-4b94-91cd-9305cda2e644'

export function AgentsClient({ agents: initialAgents, currentUserName }: AgentsClientProps) {
  const [agents, setAgents] = useState(initialAgents)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  // Result after create
  const [createResult, setCreateResult] = useState<{
    agent: Agent
    refresh_token: string | null
  } | null>(null)
  const [copied, setCopied] = useState(false)

  // Inline avatar editing
  const [editingAvatar, setEditingAvatar] = useState<string | null>(null)
  const [avatarDraft, setAvatarDraft] = useState('')
  const [savingAvatar, setSavingAvatar] = useState(false)

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name.trim(),
          avatar_url: avatarUrl.trim() || null,
          owner_id: OWNER_ID,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create agent')

      const newAgent: Agent = {
        id: json.agent.id,
        email: json.agent.email,
        full_name: json.agent.full_name,
        avatar_url: json.agent.avatar_url,
        created_at: new Date().toISOString(),
        owner_name: currentUserName,
      }
      setAgents(prev => [...prev, newAgent])
      setCreateResult({ agent: newAgent, refresh_token: json.refresh_token })
      setName('')
      setAvatarUrl('')
      toast({ type: 'success', message: `Agent "${newAgent.full_name}" created` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create agent' })
    } finally {
      setCreating(false)
    }
  }, [name, avatarUrl, currentUserName])

  const handleRevoke = useCallback(async (agentId: string) => {
    setRevoking(agentId)
    try {
      const res = await fetch(`/api/admin/agents/${agentId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to revoke agent')

      setAgents(prev => prev.filter(a => a.id !== agentId))
      toast({ type: 'success', message: 'Agent revoked' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke agent' })
    } finally {
      setRevoking(null)
    }
  }, [])

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const handleSaveAvatar = useCallback(async (agentId: string) => {
    setSavingAvatar(true)
    try {
      const res = await fetch(`/api/admin/users/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: avatarDraft.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update avatar')

      setAgents(prev => prev.map(a =>
        a.id === agentId ? { ...a, avatar_url: avatarDraft.trim() || null } : a
      ))
      setEditingAvatar(null)
      toast({ type: 'success', message: 'Avatar updated' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update avatar' })
    } finally {
      setSavingAvatar(false)
    }
  }, [avatarDraft])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Agents</h1>
        {!showCreate && !createResult && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create Agent
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && !createResult && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">New Agent</h2>
            <Button variant="ghost" size="icon-xs" onClick={() => { setShowCreate(false); setName(''); setAvatarUrl('') }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                placeholder="e.g. Lucy"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Avatar URL (optional)</label>
              <Input
                placeholder="https://..."
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Owner</label>
            <p className="text-sm">{currentUserName}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setName(''); setAvatarUrl('') }} disabled={creating}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Refresh token result */}
      {createResult && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-green-400">
              Agent &quot;{createResult.agent.full_name}&quot; created
            </h2>
            <Button variant="ghost" size="icon-xs" onClick={() => { setCreateResult(null); setShowCreate(false) }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {createResult.refresh_token ? (
            <>
              <div className="relative">
                <pre className="rounded-md bg-muted p-3 text-xs font-mono break-all whitespace-pre-wrap">
                  {createResult.refresh_token}
                </pre>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(createResult.refresh_token!)}
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this as <code className="text-xs bg-muted px-1 rounded">REFRESH_TOKEN</code> in your agent&apos;s openclaw.json env config. It will not be shown again.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No refresh token was returned.</p>
          )}
        </div>
      )}

      {/* Agents table */}
      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => {
              const displayName = agent.full_name ?? agent.email.split('@')[0]
              const initials = displayName.slice(0, 2).toUpperCase()
              const isEditingAvatar = editingAvatar === agent.id

              return (
                <tr key={agent.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative group">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={agent.avatar_url ?? undefined} alt={displayName} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        {!isEditingAvatar && (
                          <button
                            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { setEditingAvatar(agent.id); setAvatarDraft(agent.avatar_url ?? '') }}
                          >
                            <Pencil className="h-3 w-3 text-white" />
                          </button>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          <Badge variant="secondary" className="bg-violet-500/20 text-violet-400">
                            <Bot className="h-3 w-3 mr-1" />
                            Agent
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
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
                              onClick={() => handleSaveAvatar(agent.id)}
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
                    <span className="text-sm text-muted-foreground">{agent.owner_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(agent.id)}
                      disabled={revoking === agent.id}
                    >
                      {revoking === agent.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Revoke
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No agents configured.</p>
        )}
      </div>
    </div>
  )
}
