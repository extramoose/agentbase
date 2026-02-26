'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ActorChip } from '@/components/actor-chip'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Actor = {
  id: string
  name: string
  avatar_url: string | null
  type: 'human' | 'agent'
}

interface AssigneePickerProps {
  value: { id: string; type: 'human' | 'agent' } | null
  onChange: (actor: Actor | null) => void
  className?: string
}

export function AssigneePicker({ value, onChange, className }: AssigneePickerProps) {
  const [actors, setActors] = useState<Actor[]>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: members } = await supabase.rpc('get_workspace_members')
      const parsed = Array.isArray(members) ? members : []
      const humans: Actor[] = parsed.map((m: { id: string; full_name: string | null; email: string; avatar_url: string | null }) => ({
        id: m.id,
        name: m.full_name ?? m.email?.split('@')[0] ?? 'Unknown',
        avatar_url: m.avatar_url,
        type: 'human' as const,
      }))

      const { data: agentRows } = await supabase
        .from('agents')
        .select('id, name, avatar_url')
        .is('revoked_at', null)
        .order('name')
      const agents: Actor[] = (agentRows ?? []).map((a: { id: string; name: string; avatar_url: string | null }) => ({
        id: a.id,
        name: a.name,
        avatar_url: a.avatar_url,
        type: 'agent' as const,
      }))

      setActors([...humans, ...agents])
    }
    load()
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = value ? actors.find(a => a.id === value.id) ?? null : null
  const filtered = actors.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
        className="flex items-center gap-2 w-full min-h-9 px-2 py-1.5 rounded-md border border-input bg-transparent text-sm hover:bg-accent/50 transition-colors cursor-pointer"
      >
        {selected ? (
          <>
            <ActorChip actorId={selected.id} actorType={selected.type} />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null) }}
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Unassigned</span>
            <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
          </>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-48 overflow-auto py-1">
            <li
              className="px-3 py-1.5 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50"
              onClick={() => { onChange(null); setOpen(false) }}
            >
              Unassigned
            </li>
            {filtered.map(actor => (
              <li
                key={actor.id}
                className="px-2 py-1 cursor-pointer hover:bg-accent/50"
                onClick={() => { onChange(actor); setOpen(false); setSearch('') }}
              >
                <ActorChip actorId={actor.id} actorType={actor.type} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
