'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type ActorDisplay = {
  id: string
  displayName: string
  avatar_url: string | null
}

// Simple in-memory cache
const actorCache = new Map<string, ActorDisplay>()

export function seedActorCache(id: string, displayName: string, avatar_url: string | null) {
  if (!actorCache.has(id)) {
    actorCache.set(id, { id, displayName, avatar_url })
  }
}

interface ActorChipProps {
  actorId: string
  actorType?: 'human' | 'agent'
  compact?: boolean
  className?: string
}

export function ActorChip({ actorId, actorType, compact = false, className }: ActorChipProps) {
  const [actor, setActor] = useState<ActorDisplay | null>(actorCache.get(actorId) ?? null)
  const [imgError, setImgError] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (actor) return

    async function resolve() {
      // If explicitly an agent (or profiles lookup fails), check agents table
      if (actorType === 'agent') {
        const { data } = await supabase
          .from('agents')
          .select('id, name, avatar_url')
          .eq('id', actorId)
          .single()
        if (data) {
          const resolved = { id: data.id, displayName: data.name, avatar_url: data.avatar_url }
          actorCache.set(actorId, resolved)
          setActor(resolved)
          return
        }
      }

      // Try profiles first (humans)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .eq('id', actorId)
        .single()

      if (profile) {
        const resolved = {
          id: profile.id,
          displayName: profile.full_name ?? profile.email?.split('@')[0] ?? '?',
          avatar_url: profile.avatar_url,
        }
        actorCache.set(actorId, resolved)
        setActor(resolved)
        return
      }

      // Fallback: try agents table (actor_type not passed but actor is an agent)
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, avatar_url')
        .eq('id', actorId)
        .single()

      if (agent) {
        const resolved = { id: agent.id, displayName: agent.name, avatar_url: agent.avatar_url }
        actorCache.set(actorId, resolved)
        setActor(resolved)
      }
    }

    resolve()
  }, [actorId, actorType, actor])

  const displayName = actor?.displayName ?? '…'
  const initials = displayName === '…' ? '?' : displayName.slice(0, 2).toUpperCase()
  const avatarSrc = actor?.avatar_url ?? null

  const avatarContent = avatarSrc && !imgError ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc}
      alt={displayName}
      className="aspect-square size-full object-cover"
      onError={() => setImgError(true)}
    />
  ) : (
    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
  )

  if (compact) {
    return (
      <Avatar className={cn('h-6 w-6 shrink-0', className)}>
        {avatarContent}
      </Avatar>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Avatar className="h-6 w-6 shrink-0">
        {avatarContent}
      </Avatar>
      <span className="text-sm text-muted-foreground truncate">{displayName}</span>
    </div>
  )
}
