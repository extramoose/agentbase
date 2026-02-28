'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type EntityType, ENTITY_TABLE } from '@/types/entities'
import { LinkPicker } from './link-picker'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<string, string> = {
  tasks:         'bg-blue-500/20 text-blue-400',
  library_items: 'bg-yellow-500/20 text-yellow-400',
  companies:     'bg-red-500/20 text-red-400',
  people:        'bg-pink-500/20 text-pink-400',
  deals:         'bg-emerald-500/20 text-emerald-400',
}

function getEntityUrl(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'tasks':         return `/tools/tasks/${entityId}`
    case 'library_items': return `/tools/library/${entityId}`
    case 'companies':     return `/tools/crm/companies/${entityId}`
    case 'people':        return `/tools/crm/people/${entityId}`
    case 'deals':         return `/tools/crm/deals/${entityId}`
    default:              return ''
  }
}

function formatEntityType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityLink {
  link_id: string
  target_type: string
  target_id: string
  created_at: string
}

interface ResolvedLink extends EntityLink {
  name: string
}

interface LinksSectionProps {
  entityType: EntityType
  entityId: string
}

// ---------------------------------------------------------------------------
// Name resolution: batch by entity type
// ---------------------------------------------------------------------------

async function resolveNames(links: EntityLink[]): Promise<Map<string, string>> {
  const supabase = createClient()
  const nameMap = new Map<string, string>()

  const byType = new Map<string, string[]>()
  for (const link of links) {
    const ids = byType.get(link.target_type) ?? []
    ids.push(link.target_id)
    byType.set(link.target_type, ids)
  }

  const queries: PromiseLike<void>[] = []

  for (const [type, ids] of byType) {
    const uniqueIds = [...new Set(ids)]

    if (type === 'tasks') {
      queries.push(
        supabase.from('tasks').select('id,title,ticket_id').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`tasks:${row.id}`, `Task #${row.ticket_id}: ${row.title}`)
          })
      )
    } else if (type === 'companies') {
      queries.push(
        supabase.from('companies').select('id,name').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`companies:${row.id}`, row.name)
          })
      )
    } else if (type === 'people') {
      queries.push(
        supabase.from('people').select('id,name').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`people:${row.id}`, row.name)
          })
      )
    } else if (type === 'library_items') {
      queries.push(
        supabase.from('library_items').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`library_items:${row.id}`, row.title)
          })
      )
    } else if (type === 'deals') {
      queries.push(
        supabase.from('deals').select('id,title').in('id', uniqueIds)
          .then(({ data }) => {
            for (const row of data ?? []) nameMap.set(`deals:${row.id}`, row.title)
          })
      )
    }
  }

  await Promise.all(queries)
  return nameMap
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinksSection({ entityType, entityId }: LinksSectionProps) {
  const router = useRouter()
  const [links, setLinks] = useState<ResolvedLink[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  const sourceTable = ENTITY_TABLE[entityType]

  // Fetch links + resolve names
  const fetchLinks = useCallback(async () => {
    const res = await fetch(`/api/entity-links?sourceType=${sourceTable}&sourceId=${entityId}`)
    if (!res.ok) { setLoading(false); return }
    const { data } = (await res.json()) as { data: EntityLink[] }
    if (!data || data.length === 0) {
      setLinks([])
      setLoading(false)
      return
    }
    const nameMap = await resolveNames(data)
    setLinks(
      data.map(link => ({
        ...link,
        name: nameMap.get(`${link.target_type}:${link.target_id}`) ?? 'Unknown',
      }))
    )
    setLoading(false)
  }, [sourceTable, entityId])

  useEffect(() => {
    setLoading(true)
    fetchLinks()
  }, [fetchLinks])

  // Delete link (optimistic)
  const deleteLink = useCallback(async (link: ResolvedLink) => {
    setLinks(prev => prev.filter(l => l.link_id !== link.link_id))

    const res = await fetch('/api/commands/delete-entity-link', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_type: sourceTable,
        source_id: entityId,
        target_type: link.target_type,
        target_id: link.target_id,
      }),
    })

    if (!res.ok) fetchLinks()
  }, [sourceTable, entityId, fetchLinks])

  // Called by LinkPicker when a link is successfully created
  const handleLinkCreated = useCallback(() => {
    fetchLinks()
  }, [fetchLinks])

  const linkedIds = new Set(links.map(l => `${l.target_type}:${l.target_id}`))

  if (loading) {
    return (
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Links</label>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1 block">Links</label>

      {/* Linked entity rows */}
      {links.length > 0 && (
        <div className="space-y-1 mb-2">
          {links.map(link => {
            const colors = ENTITY_COLORS[link.target_type] ?? 'bg-zinc-500/20 text-zinc-400'
            const url = getEntityUrl(link.target_type, link.target_id)
            return (
              <div
                key={link.link_id}
                className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
              >
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0', colors)}>
                  {formatEntityType(link.target_type)}
                </span>
                <button
                  type="button"
                  onClick={() => { if (url) router.push(url) }}
                  className="text-sm truncate hover:underline text-left flex-1 min-w-0"
                >
                  {link.name}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteLink(link) }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add link button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPickerOpen(true)}
        className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add link
      </Button>

      {/* Link picker dialog */}
      {pickerOpen && (
        <LinkPicker
          sourceType={sourceTable}
          sourceId={entityId}
          linkedIds={linkedIds}
          onLinkCreated={handleLinkCreated}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
