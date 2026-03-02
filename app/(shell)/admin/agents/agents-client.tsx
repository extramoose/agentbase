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
import { Check, Copy, Loader2, Plus, X } from 'lucide-react'

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
  currentUserName: string
  currentUserId: string
}

export function AgentsClient({ currentUserName, currentUserId }: AgentsClientProps) {
  const searchParams = useSearchParams()
  const [showCreate, setShowCreate] = useState(searchParams.get("create") === "true")
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


    </div>
  )
}
