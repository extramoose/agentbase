'use client'

import { useState, useCallback } from 'react'
import { AvatarUpload } from '@/components/avatar-upload'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { Bot, Check, Copy, Loader2, Plus, Trash2, X } from 'lucide-react'

type Agent = {
  id: string
  name: string
  avatar_url: string | null
  owner_id: string
  last_seen_at: string | null
  revoked_at: string | null
  created_at: string
  owner_name: string
}

interface AgentsClientProps {
  agents: Agent[]
  currentUserName: string
  currentUserId: string
  isOwner: boolean
}

export function AgentsClient({ agents: initialAgents, currentUserName, currentUserId, isOwner }: AgentsClientProps) {
  const [agents, setAgents] = useState(initialAgents)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')

  // Result after create
  const [createResult, setCreateResult] = useState<{
    agent: Agent
    api_key: string | null
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create agent')

      const newAgent: Agent = {
        id: json.agent.id,
        name: json.agent.name,
        avatar_url: json.agent.avatar_url,
        owner_id: currentUserId,
        last_seen_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
        owner_name: currentUserName,
      }
      setAgents(prev => [newAgent, ...prev])
      setCreateResult({ agent: newAgent, api_key: json.api_key })
      setName('')
      toast({ type: 'success', message: `Agent "${newAgent.name}" created` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create agent' })
    } finally {
      setCreating(false)
    }
  }, [name, currentUserName, currentUserId])

  const handleRevoke = useCallback(async (agentId: string) => {
    setRevoking(agentId)
    try {
      const res = await fetch(`/api/admin/agents/${agentId}`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to revoke agent')

      setAgents(prev => prev.map(a =>
        a.id === agentId ? { ...a, revoked_at: new Date().toISOString() } : a
      ))
      toast({ type: 'success', message: 'Agent revoked' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke agent' })
    } finally {
      setRevoking(null)
    }
  }, [])

  const handleDelete = useCallback(async (agent: Agent) => {
    const confirmed = confirm(`Permanently delete ${agent.name}? Their activity history will be preserved.`)
    if (!confirmed) return

    setDeleting(agent.id)
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete agent')

      setAgents(prev => prev.filter(a => a.id !== agent.id))
      toast({ type: 'success', message: 'Agent deleted' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to delete agent' })
    } finally {
      setDeleting(null)
    }
  }, [])

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Agents</h1>
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
            <Button variant="ghost" size="icon-xs" onClick={() => { setShowCreate(false); setName('') }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
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
            <label className="text-xs text-muted-foreground">Owner</label>
            <p className="text-sm">{currentUserName}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setName('') }} disabled={creating}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* API key result */}
      {createResult && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-green-400">
              Agent &quot;{createResult.agent.name}&quot; created
            </h2>
            <Button variant="ghost" size="icon-xs" onClick={() => { setCreateResult(null); setShowCreate(false) }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {createResult.api_key ? (
            <>
              <div className="relative">
                <pre className="rounded-md bg-muted p-3 text-xs font-mono break-all whitespace-pre-wrap">
                  {createResult.api_key}
                </pre>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="absolute top-2 right-2"
                  onClick={() => handleCopy(createResult.api_key!)}
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this as <code className="text-xs bg-muted px-1 rounded">AGENT_API_KEY</code> in the agent&apos;s environment config. It will not be shown again.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No API key was returned.</p>
          )}
        </div>
      )}

      {/* Agents table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full min-w-[600px]">
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
              const displayName = agent.name
              const isRevoked = !!agent.revoked_at

              return (
                <tr key={agent.id} className={`border-b border-border last:border-0 hover:bg-muted/40${isRevoked ? ' opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarUpload
                        currentUrl={agent.avatar_url}
                        name={displayName}
                        uploadUrl={`/api/admin/agents/${agent.id}/avatar`}
                        size="sm"
                        onSuccess={(newUrl) =>
                          setAgents(prev => prev.map(a =>
                            a.id === agent.id ? { ...a, avatar_url: newUrl } : a
                          ))
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          <Badge variant="secondary" className="bg-violet-500/20 text-violet-400">
                            <Bot className="h-3 w-3 mr-1" />
                            Agent
                          </Badge>
                          {isRevoked && (
                            <span className="bg-red-500/20 text-red-400 text-xs rounded px-1.5 py-0.5">
                              Revoked
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{agent.owner_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span suppressHydrationWarning className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                    </span>
                    {isRevoked && agent.revoked_at && (
                      <p className="text-xs text-muted-foreground/70">
                        Revoked {formatDistanceToNow(new Date(agent.revoked_at), { addSuffix: true })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!isRevoked && (
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
                    )}
                    {isRevoked && isOwner && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(agent)}
                        disabled={deleting === agent.id}
                      >
                        {deleting === agent.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </Button>
                    )}
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
