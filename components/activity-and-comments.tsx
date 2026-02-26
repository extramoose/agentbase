'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import { Send } from 'lucide-react'
import { formatActivityEvent } from '@/lib/format-activity'
import { MarkdownRenderer } from '@/components/markdown-renderer'

type ActivityEntry = {
  id: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  event_type: string
  actor_id: string
  actor_type: 'human' | 'agent'
  old_value: string | null
  new_value: string | null
  body: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

interface ActivityAndCommentsProps {
  entityType: string
  entityId: string
  currentUserId?: string
}

export function ActivityAndComments({ entityType, entityId, currentUserId }: ActivityAndCommentsProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Initial load
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_activity_log', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: 50,
      })
      setEntries((data ?? []) as ActivityEntry[])
      setLoading(false)
    }
    load()
  }, [entityType, entityId, supabase])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`activity:${entityType}:${entityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
          filter: `entity_type=eq.${entityType},entity_id=eq.${entityId}`,
        },
        (payload) => {
          setEntries(prev => [payload.new as ActivityEntry, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [entityType, entityId, supabase])

  async function submitComment() {
    if (!comment.trim() || submitting) return
    setSubmitting(true)

    // Optimistic update
    const optimistic: ActivityEntry = {
      id: `temp-${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: null,
      event_type: 'commented',
      actor_id: currentUserId ?? '',
      actor_type: 'human',
      old_value: null,
      new_value: null,
      body: comment,
      payload: null,
      created_at: new Date().toISOString(),
    }
    setEntries(prev => [optimistic, ...prev])
    setComment('')

    try {
      await fetch('/api/commands/add-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, body: comment }),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Activity</h3>

      {/* Comment form */}
      <div className="space-y-2">
        <Textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Add a comment..."
          className="resize-none text-sm min-h-[72px]"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment()
          }}
        />
        {comment.trim() && (
          <Button size="sm" onClick={submitComment} disabled={submitting}>
            <Send className="h-3 w-3 mr-1" />
            Comment
          </Button>
        )}
      </div>

      {/* Activity list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-6 h-6 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <div key={entry.id} className="flex gap-3">
              <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} compact />
              <div className="flex-1 min-w-0">
                {entry.event_type === 'commented' ? (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <MarkdownRenderer content={entry.body ?? ''} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {formatActivityEvent(entry)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
