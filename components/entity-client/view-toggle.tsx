'use client'

import { useState, useEffect } from 'react'
import { LayoutGrid, List, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'

type View = 'grid' | 'table' | 'stickies'

function readViewParam(defaultView: View): View {
  if (typeof window === 'undefined') return defaultView
  const params = new URLSearchParams(window.location.search)
  const v = params.get('view')
  if (v === 'grid') return 'grid'
  if (v === 'table') return 'table'
  if (v === 'stickies') return 'stickies'
  return defaultView
}

export function ViewToggle({
  onChange,
  defaultView = 'table',
  showStickies = false,
}: {
  onChange?: (view: View) => void
  defaultView?: View
  showStickies?: boolean
}) {
  const [view, setView] = useState<View>(defaultView)

  // Read initial value from URL on mount
  useEffect(() => {
    setView(readViewParam(defaultView))
  }, [defaultView])

  function toggle(next: View) {
    setView(next)
    onChange?.(next)
    const params = new URLSearchParams(window.location.search)
    if (next === 'table') {
      params.delete('view')
    } else {
      params.set('view', next)
    }
    const qs = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )
  }

  return (
    <div className="flex items-center rounded-md border border-border">
      <button
        onClick={() => toggle('grid')}
        className={cn(
          'p-1.5 rounded-l-md transition-colors',
          view === 'grid'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        title="Grid view"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => toggle('table')}
        className={cn(
          'p-1.5 transition-colors',
          !showStickies && 'rounded-r-md',
          view === 'table'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        title="Table view"
      >
        <List className="h-4 w-4" />
      </button>
      {showStickies && (
        <button
          onClick={() => toggle('stickies')}
          className={cn(
            'p-1.5 rounded-r-md transition-colors',
            view === 'stickies'
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          title="Stickies view"
        >
          <StickyNote className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
