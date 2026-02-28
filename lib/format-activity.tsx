import React from 'react'

const STATUS_COLORS: Record<string, string> = {
  todo: 'text-muted-foreground',
  in_progress: 'text-blue-400',
  done: 'text-green-400',
  cancelled: 'text-red-400',
  blocked: 'text-orange-400',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-muted-foreground',
}

const INTERNAL_FIELDS = new Set([
  'assignee_type',   // always paired with assignee_id — suppress, use assignee_id only
  'sort_order',      // internal ordering — never user-facing
  'updated_at',      // system timestamp
  'ticket_id',       // auto-assigned integer — not a user action
  'tenant_id',       // infrastructure
  'id',              // primary key
  'created_at',      // system timestamp
])

const FIELD_LABELS: Record<string, string> = {
  assignee_id: 'assignee',
  due_date: 'due date',
  source_meeting_id: 'linked meeting',
  body: 'description',
  name: 'name',
  title: 'title',
  tags: 'tags',
  type: 'type',
  notes: 'notes',
  location: 'location',
  url: 'URL',
  calendar_url: 'calendar link',
  phase: 'phase',
  start_time: 'start time',
  end_time: 'end time',
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatDate(s?: string): string {
  if (!s) return '?'
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return s
  }
}

function TagChip({ tag, variant }: { tag: string; variant: 'added' | 'removed' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
        variant === 'added'
          ? 'bg-green-500/15 text-green-400'
          : 'bg-red-500/15 text-red-400 line-through'
      }`}
    >
      #{tag}
    </span>
  )
}

export type ActivityLogEntry = {
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

export interface ActivityGroup {
  items: ActivityLogEntry[]
  entityId: string
  entityType: string
  firstItem: ActivityLogEntry
  latestItem: ActivityLogEntry
}

const EVENT_SIGNIFICANCE: Record<string, number> = {
  created: 0,
  deleted: 1,
  status_changed: 2,
  priority_changed: 3,
  assignee_changed: 4,
  commented: 5,
  updated: 6,
}

export function filterActivityItems(items: ActivityLogEntry[]): ActivityLogEntry[] {
  return items.filter(item => {
    if (item.event_type === 'field_updated') {
      const field = String(item.payload?.field ?? '')
      return !INTERNAL_FIELDS.has(field)
    }
    return true
  })
}

export function getMostSignificantItem(items: ActivityLogEntry[]): ActivityLogEntry {
  return items.reduce((best, item) => {
    const bestPrio = EVENT_SIGNIFICANCE[best.event_type] ?? 99
    const itemPrio = EVENT_SIGNIFICANCE[item.event_type] ?? 99
    return itemPrio < bestPrio ? item : best
  })
}

export function groupActivityItems(items: ActivityLogEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = []

  for (const item of items) {
    const lastGroup = groups[groups.length - 1]
    const timeDiff = lastGroup
      ? Math.abs(new Date(lastGroup.latestItem.created_at).getTime() - new Date(item.created_at).getTime())
      : Infinity

    if (lastGroup && lastGroup.entityId === item.entity_id && timeDiff <= 60000) {
      lastGroup.items.push(item)
      lastGroup.latestItem = item
    } else {
      groups.push({
        items: [item],
        entityId: item.entity_id,
        entityType: item.entity_type,
        firstItem: item,
        latestItem: item,
      })
    }
  }

  return groups
}

export function formatActivityEvent(event: {
  event_type: string
  entity_type: string
  entity_label?: string | null
  payload?: Record<string, unknown> | null
}): React.ReactNode {
  const { event_type, entity_label, payload } = event

  switch (event_type) {
    case 'status_changed': {
      const oldVal = String(payload?.old ?? '?')
      const newVal = String(payload?.new ?? '?')
      return (
        <>
          changed status from{' '}
          <span className={STATUS_COLORS[oldVal] ?? 'text-muted-foreground'}>{formatLabel(oldVal)}</span>
          {' \u2192 '}
          <span className={STATUS_COLORS[newVal] ?? 'text-muted-foreground'}>{formatLabel(newVal)}</span>
        </>
      )
    }
    case 'priority_changed': {
      const oldVal = String(payload?.old ?? '?')
      const newVal = String(payload?.new ?? '?')
      return (
        <>
          changed priority from{' '}
          <span className={PRIORITY_COLORS[oldVal] ?? 'text-muted-foreground'}>{formatLabel(oldVal)}</span>
          {' \u2192 '}
          <span className={PRIORITY_COLORS[newVal] ?? 'text-muted-foreground'}>{formatLabel(newVal)}</span>
        </>
      )
    }
    case 'title_changed':
      return <>renamed to &ldquo;{String(payload?.new ?? '?')}&rdquo;</>
    case 'due_date_set':
      return <>set due date to {formatDate(payload?.new as string | undefined)}</>
    case 'due_date_cleared':
      return <>cleared due date</>
    case 'tags_changed': {
      const added = (payload?.added as string[] | null) ?? []
      const removed = (payload?.removed as string[] | null) ?? []
      return (
        <>
          {added.length > 0 && (
            <>
              added{' '}
              {added.map((t, i) => (
                <React.Fragment key={t}>
                  {i > 0 && ' '}
                  <TagChip tag={t} variant="added" />
                </React.Fragment>
              ))}
            </>
          )}
          {added.length > 0 && removed.length > 0 && '; '}
          {removed.length > 0 && (
            <>
              removed{' '}
              {removed.map((t, i) => (
                <React.Fragment key={t}>
                  {i > 0 && ' '}
                  <TagChip tag={t} variant="removed" />
                </React.Fragment>
              ))}
            </>
          )}
        </>
      )
    }
    case 'field_updated': {
      const field = String(payload?.field ?? 'field')
      const label = FIELD_LABELS[field] ?? field.replace(/_/g, ' ')
      const newVal = payload?.new
      if (newVal !== null && newVal !== undefined && String(newVal).length < 60) {
        return <>updated {label} to <span className="text-foreground font-medium">{String(newVal)}</span></>
      }
      return <>updated {label}</>
    }
    case 'assignee_changed': {
      const newVal = payload?.new_label ?? payload?.new ?? null
      if (!newVal) return <>cleared assignee</>
      return <>assigned to <span className="text-foreground font-medium">{String(newVal)}</span></>
    }
    case 'created':
      return entity_label ? <>created &ldquo;{entity_label}&rdquo;</> : <>created</>
    case 'deleted':
      return entity_label ? <>deleted &ldquo;{entity_label}&rdquo;</> : <>deleted</>
    case 'linked': {
      const linkedType = String(payload?.linked_type ?? 'entity')
      const linkedId = payload?.linked_id ? String(payload.linked_id).slice(0, 8) : '?'
      return <>linked <span className="text-foreground font-medium">{formatLabel(linkedType)}</span> #{linkedId}</>
    }
    case 'unlinked': {
      const unlinkedType = String(payload?.unlinked_type ?? 'entity')
      const unlinkedId = payload?.unlinked_id ? String(payload.unlinked_id).slice(0, 8) : '?'
      return <>unlinked <span className="text-foreground font-medium">{formatLabel(unlinkedType)}</span> #{unlinkedId}</>
    }
    case 'commented':
      return <>commented</>
    case 'updated':
      return <>updated {formatLabel(event.entity_type)}</>
    default:
      return <>{event_type.replace(/_/g, ' ')}</>
  }
}
