'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronRight, Send, Trash2 } from 'lucide-react'
import type { StreamEntry } from '@/lib/types/stream'

interface StreamPanelProps {
  entityType: string
  entityId: string
  className?: string
}

export function StreamPanel({ entityType, entityId, className }: StreamPanelProps) {
  const [entries, setEntries] = useState<StreamEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Get current user id
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [supabase])

  // Initial load
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/stream?entity_type=${entityType}&entity_id=${entityId}`)
      const json = await res.json()
      setEntries((json.data ?? []) as StreamEntry[])
      setLoading(false)
    }
    load()
  }, [entityType, entityId])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`stream:${entityType}:${entityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_entries',
          filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
        },
        (payload) => {
          setEntries(prev => [...prev, payload.new as StreamEntry])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'stream_entries',
          filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id
          if (deletedId) {
            setEntries(prev => prev.filter(e => e.id !== deletedId))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [entityType, entityId, supabase])

  async function handleSubmit() {
    if (!input.trim() || submitting) return
    setSubmitting(true)

    const optimistic: StreamEntry = {
      id: `temp-${Date.now()}`,
      tenant_id: '',
      entity_type: entityType,
      entity_id: entityId,
      content: input,
      actor_id: currentUserId ?? '',
      actor_type: 'human',
      created_at: new Date().toISOString(),
    }
    setEntries(prev => [...prev, optimistic])
    setInput('')

    try {
      await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, content: input }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    await fetch(`/api/stream/${id}`, { method: 'DELETE' })
  }

  return (
    <div className={className}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground w-full"
      >
        {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        Stream
        <span className="text-xs text-muted-foreground ml-1">({entries.length})</span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-3">
          {/* Entries */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-2 animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="group flex gap-2 items-start rounded-md px-2 py-1.5 hover:bg-accent/50"
                >
                  <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} compact />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words">{entry.content}</p>
                    <p suppressHydrationWarning className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {currentUserId === entry.actor_id && entry.actor_type === 'human' && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Add to stream..."
              className="text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
