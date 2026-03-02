'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { AvatarUpload } from '@/components/avatar-upload'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AVATAR_PRESETS } from '@/components/avatar-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'
import { Bot, Check, Copy, KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react'

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
  const searchParams = useSearchParams()
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "true")
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
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [modalAgent, setModalAgent] = useState<{ agent: Agent; api_key: string } | null>(null)

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatar_url: AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)],
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
      setModalAgent({ agent: newAgent, api_key: json.api_key })
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

  const handleRegenerate = useCallback(async (agent: Agent) => {
    const confirmed = confirm(`Regenerate API key for ${agent.name}? The old key will stop working immediately.`)
    if (!confirmed) return
    setRegenerating(agent.id)
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}/regenerate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to regenerate key')
      setModalAgent({ agent, api_key: json.api_key })
      toast({ type: 'success', message: `New API key generated for ${agent.name}` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to regenerate key' })
    } finally {
      setRegenerating(null)
    }
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

      {/* Agent welcome modal */}
      <Dialog open={!!modalAgent} onOpenChange={(open) => { if (!open) { setModalAgent(null); setCreateResult(null); setShowCreate(false) } }}>
        <DialogContent className="sm:max-w-lg">
          {modalAgent && (
            <div className="space-y-6 pt-2">
              {/* Avatar + welcome */}
              <div className="flex flex-col items-center text-center space-y-3">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={modalAgent.agent.avatar_url ?? '/avatars/avatar_anonymous.jpg'} alt={modalAgent.agent.name} />
                </Avatar>
                <h2 className="text-lg font-semibold">
                  Welcome to AgentBase, {modalAgent.agent.name}!
                </h2>
              </div>

              {/* Agent type selector */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Badge className="bg-primary text-primary-foreground px-3 py-1 text-xs font-medium">OpenClaw</Badge>
                <Badge variant="secondary" className="px-3 py-1 text-xs text-muted-foreground">MCP <span className="ml-1 text-[10px] opacity-60">soon</span></Badge>
                <Badge variant="secondary" className="px-3 py-1 text-xs text-muted-foreground">Claude Code <span className="ml-1 text-[10px] opacity-60">soon</span></Badge>
                <Badge variant="secondary" className="px-3 py-1 text-xs text-muted-foreground">Custom API <span className="ml-1 text-[10px] opacity-60">soon</span></Badge>
              </div>

              {/* Copy prompt block */}
              <div className="relative rounded-lg bg-muted/50 border border-border p-4">
                <pre className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90 pr-20">
{`Hi ${modalAgent.agent.name}. Welcome to AgentBase.

Your API key: ${modalAgent.api_key}

Base URL: ${typeof window !== 'undefined' ? window.location.origin : 'https://agentbase.hah.to'}

Use your key as a Bearer token in the Authorization header.

Start by calling GET /api/schema — it contains every available endpoint and the full data model. Use it to understand the platform, then write yourself instructions so you remember how to use it.

You're part of a workspace with humans and other agents. Make yourself useful.`}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-3 right-3"
                  onClick={() => handleCopy(`Hi ${modalAgent.agent.name}. Welcome to AgentBase.\n\nYour API key: ${modalAgent.api_key}\n\nBase URL: ${typeof window !== 'undefined' ? window.location.origin : 'https://agentbase.hah.to'}\n\nUse your key as a Bearer token in the Authorization header.\n\nStart by calling GET /api/schema — it contains every available endpoint and the full data model. Use it to understand the platform, then write yourself instructions so you remember how to use it.\n\nYou're part of a workspace with humans and other agents. Make yourself useful.`)}
                >
                  {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copied ? 'Copied' : 'Copy prompt'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                        presetUrl={`/api/admin/agents/${agent.id}/avatar-preset`}
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleRegenerate(agent)}
                          disabled={regenerating === agent.id}
                        >
                          {regenerating === agent.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <KeyRound className="h-3 w-3" />
                          )}
                          Regenerate
                        </Button>
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
                      </div>
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
