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

export function formatActivityEvent(event: {
  event_type: string
  entity_type: string
  payload?: Record<string, unknown> | null
}): React.ReactNode {
  const { event_type, payload } = event

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
    case 'field_updated':
      return <>updated {formatLabel(String(payload?.field ?? 'field'))}</>
    case 'created':
      return <>created</>
    case 'deleted':
      return <>deleted</>
    case 'commented':
      return <>commented</>
    case 'updated':
      return <>updated {formatLabel(event.entity_type)}</>
    default:
      return <>{event_type.replace(/_/g, ' ')}</>
  }
}
