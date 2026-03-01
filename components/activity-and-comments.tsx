'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip, seedActorCache } from '@/components/actor-chip'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import { ChevronRight, Send } from 'lucide-react'
import {
  formatActivityEvent,
  groupActivityItems,
  getMostSignificantItem,
  filterActivityItems,
  type ActivityLogEntry,
} from '@/lib/format-activity'
import { MarkdownRenderer } from '@/components/markdown-renderer'

interface ActivityAndCommentsProps {
  entityType: string
  entityId: string
  currentUserId?: string
  noCollapse?: boolean
}

export function ActivityAndComments({ entityType, entityId, currentUserId, noCollapse }: ActivityAndCommentsProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const resolvedUserId = useRef(currentUserId ?? '')

  function toggleGroup(groupKey: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }

  // Seed actor cache with current user's profile so optimistic comments show the correct avatar
  useEffect(() => {
    async function seed() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      resolvedUserId.current = user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .eq('id', user.id)
        .single()
      if (profile) {
        seedActorCache(profile.id, profile.full_name ?? profile.email?.split('@')[0] ?? '?', profile.avatar_url)
      }
    }
    seed()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_activity_log', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: 50,
      })
      setEntries((data ?? []) as ActivityLogEntry[])
      setLoading(false)
    }
    load()
  }, [entityType, entityId])

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
          setEntries(prev => [payload.new as ActivityLogEntry, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [entityType, entityId])

  async function submitComment() {
    if (!comment.trim() || submitting) return
    setSubmitting(true)

    // Optimistic update
    const optimistic: ActivityLogEntry = {
      id: `temp-${Date.now()}`,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: null,
      event_type: 'commented',
      actor_id: currentUserId || resolvedUserId.current,
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

  const groups = useMemo(() => groupActivityItems(filterActivityItems(entries)), [entries])

  function renderSingleEntry(entry: ActivityLogEntry) {
    return (
      <div key={entry.id} className="flex gap-3">
        <ActorChip actorId={entry.actor_id} actorType={entry.actor_type} />
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
          <p suppressHydrationWarning className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">History</h3>

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
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            // Single-item group — render exactly as before
            if (group.items.length === 1) {
              return renderSingleEntry(group.items[0])
            }

            // Multi-item group — collapsed/expandable row
            const groupKey = group.firstItem.id
            const isExpanded = noCollapse || expandedGroups.has(groupKey)
            const headline = getMostSignificantItem(group.items)
            const extraCount = group.items.length - 1
            const isCreateWithFields = headline.event_type === 'created' && group.items.every(i => i === headline || i.event_type === 'field_updated')

            if (noCollapse) {
              return (
                <div key={groupKey} className="space-y-4">
                  {group.items.map(entry => renderSingleEntry(entry))}
                </div>
              )
            }

            return (
              <div key={groupKey}>
                <div
                  className="flex gap-3 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-muted/40 transition-colors"
                  onClick={() => toggleGroup(groupKey)}
                >
                  <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  <ActorChip actorId={group.firstItem.actor_id} actorType={group.firstItem.actor_type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {formatActivityEvent(headline)}
                      {extraCount > 0 && (
                        <span className="text-xs ml-2">
                          +{extraCount} {isCreateWithFields ? (extraCount === 1 ? 'field set' : 'fields set') : (extraCount === 1 ? 'more change' : 'more changes')}
                        </span>
                      )}
                    </p>
                    <p suppressHydrationWarning className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(group.latestItem.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-l-2 border-muted ml-5 pl-3 space-y-4 mt-2">
                    {group.items.map(entry => renderSingleEntry(entry))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}
