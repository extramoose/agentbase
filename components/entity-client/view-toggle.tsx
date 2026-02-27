'use client'

import { useState, useEffect } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

type View = 'grid' | 'table'

function readViewParam(): View {
  if (typeof window === 'undefined') return 'table'
  const params = new URLSearchParams(window.location.search)
  const v = params.get('view')
  return v === 'grid' ? 'grid' : 'table'
}

export function ViewToggle({
  onChange,
}: {
  onChange?: (view: View) => void
}) {
  const [view, setView] = useState<View>('table')

  // Read initial value from URL on mount
  useEffect(() => {
    setView(readViewParam())
  }, [])

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
          'p-1.5 rounded-r-md transition-colors',
          view === 'table'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        title="Table view"
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  )
}
