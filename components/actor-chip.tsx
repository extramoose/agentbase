'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string
}

// Simple in-memory cache
const profileCache = new Map<string, Profile>()

interface ActorChipProps {
  actorId: string
  compact?: boolean
  className?: string
}

export function ActorChip({ actorId, compact = false, className }: ActorChipProps) {
  const [profile, setProfile] = useState<Profile | null>(profileCache.get(actorId) ?? null)
  const supabase = createClient()

  useEffect(() => {
    if (profile) return
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .eq('id', actorId)
      .single()
      .then(({ data }) => {
        if (data) {
          profileCache.set(actorId, data as Profile)
          setProfile(data as Profile)
        }
      })
  }, [actorId, profile, supabase])

  const displayName = profile?.full_name ?? profile?.email?.split('@')[0] ?? '…'
  const initials = displayName.slice(0, 2).toUpperCase()

  if (compact) {
    return (
      <Avatar className={cn('h-6 w-6 shrink-0', className)}>
        <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Avatar className="h-6 w-6 shrink-0">
        <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="text-sm text-muted-foreground truncate">{displayName}</span>
    </div>
  )
}
