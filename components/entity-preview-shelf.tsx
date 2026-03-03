'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'
import { MarkdownRenderer } from '@/components/markdown-renderer'

const TABLE_MAP: Record<string, string> = {
  tasks: 'tasks',
}

interface EntityPreviewShelfProps {
  entityType: string
  entityId: string
  entityLabel?: string | null
  onClose: () => void
}

export { TABLE_MAP }

export function EntityPreviewShelf({ entityType, entityId, entityLabel, onClose }: EntityPreviewShelfProps) {
  const [entity, setEntity] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const table = TABLE_MAP[entityType]

  useEffect(() => {
    if (!table) { setLoading(false); return }
    supabase
      .from(table)
      .select('*')
      .eq('id', entityId)
      .single()
      .then(({ data }) => {
        setEntity(data as Record<string, unknown> | null)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable
  }, [entityId, table])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const title = entityLabel ?? (entity?.title as string) ?? (entity?.name as string) ?? entityType

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 h-full w-full sm:w-[480px] sm:max-w-full bg-background border-l border-border flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">{entityType.replace(/_/g, ' ')}</p>
            <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!loading && !entity && <p className="text-sm text-muted-foreground">Entity not found or deleted.</p>}
          {!loading && entity && (
            <EntityFields entityType={entityType} entity={entity} />
          )}
        </div>
      </div>
    </>
  )
}

const MARKDOWN_FIELDS = new Set(['Body', 'Notes', 'Content'])

function EntityFields({ entityType, entity }: { entityType: string; entity: Record<string, unknown> }) {
  const rows: { label: string; value: unknown }[] = []

  if (entityType === 'tasks') {
    rows.push(
      { label: 'Status', value: entity.status },
      { label: 'Priority', value: entity.priority },
      { label: 'Assignee', value: entity.assignee },
      { label: 'Due date', value: entity.due_date },
      { label: 'Tags', value: Array.isArray(entity.tags) ? (entity.tags as string[]).join(', ') : null },
      { label: 'Body', value: entity.body },
    )
  }

  return (
    <dl className="space-y-4">
      {rows.filter(r => r.value != null && r.value !== '').map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
          <dd className="text-sm text-foreground">
            {MARKDOWN_FIELDS.has(label)
              ? <MarkdownRenderer content={String(value)} />
              : <span className="whitespace-pre-wrap">{String(value)}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
