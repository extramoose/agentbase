'use client'

import { useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AVATAR_PRESETS } from '@/components/avatar-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'

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
}

export function AgentsClient({ agents: initialAgents, currentUserName, currentUserId }: AgentsClientProps) {
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState(initialAgents)
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "true")
  const [revoking, setRevoking] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Create form state
  const [name, setName] = useState('')

  // Result after create
  const [createResult, setCreateResult] = useState<{
    agent: Agent
    api_key: string | null
  } | null>(null)
  const [copied, setCopied] = useState(false)
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

  const handleRevoke = useCallback(async (agent: Agent) => {
    const confirmed = confirm(`Permanently revoke ${agent.name}? This CANNOT be undone. The agent will lose all API access immediately.`)
    if (!confirmed) return
    setRevoking(agent.id)
    try {
      const res = await fetch(`/api/admin/agents/${agent.id}`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to revoke agent')
      setAgents(prev => prev.filter(a => a.id !== agent.id))
      toast({ type: 'success', message: `${agent.name} has been revoked` })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revoke agent' })
    } finally {
      setRevoking(null)
    }
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

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Agents</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Create Agent
        </Button>
      </div>

      {/* Create agent modal */}
      <Dialog open={showCreate && !createResult} onOpenChange={(open) => { if (!open) { setShowCreate(false); setName('') } }}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4">
            <h2 className="text-base font-semibold">New Agent</h2>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                autoFocus
                placeholder="e.g. Lucy"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !creating) handleCreate() }}
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
        </DialogContent>
      </Dialog>

      {/* Agent welcome modal */}
      <Dialog open={!!modalAgent} onOpenChange={(open) => { if (!open) { setModalAgent(null); setCreateResult(null); setShowCreate(false) } }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-3">
                <pre className="text-sm whitespace-pre-wrap break-all leading-relaxed text-foreground/90">
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
                  className="w-full"
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

      {/* Agent cards */}
      {agents.filter(a => !a.revoked_at).length > 0 ? (
        <div className="space-y-3">
          {agents.filter(a => !a.revoked_at).map(agent => (
            <div key={agent.id} className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-muted/40 transition-colors">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={agent.avatar_url ?? '/avatars/avatar_anonymous.jpg'} alt={agent.name} />
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{agent.name}</p>
                <p className="text-xs text-muted-foreground">Owner: {agent.owner_name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRegenerate(agent)}
                  disabled={regenerating === agent.id}
                >
                  {regenerating === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                  <span className="hidden sm:inline">Regenerate</span>
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRevoke(agent)}
                  disabled={revoking === agent.id}
                >
                  {revoking === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  <span className="hidden sm:inline">Revoke</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No agents yet. Create one to get started.</p>
        </div>
      )}
    </div>
  )
}
