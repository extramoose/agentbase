'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, Video, BookOpen, BookMarked, ShoppingCart, Users, Clock,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

type CmdItem = {
  id: string
  label: string
  icon: React.ElementType
  action: () => void
  section: 'nav' | 'action' | 'recent'
}

const NAV_ITEMS = [
  { id: 'tasks',    label: 'Tasks',    icon: CheckSquare, href: '/tools/tasks' },
  { id: 'meetings', label: 'Meetings', icon: Video,       href: '/tools/meetings' },
  { id: 'library',  label: 'Library',  icon: BookOpen,    href: '/tools/library' },
  { id: 'diary',    label: 'Diary',    icon: BookMarked,  href: '/tools/diary' },
  { id: 'grocery',  label: 'Grocery',  icon: ShoppingCart, href: '/tools/grocery' },
  { id: 'crm',      label: 'CRM',      icon: Users,       href: '/tools/crm' },
  { id: 'history',  label: 'History',  icon: Clock,       href: '/history' },
]

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Toggle on Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        setQuery('')
        setSelected(0)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelected(0)
  }, [])

  // Build items list
  const items: CmdItem[] = NAV_ITEMS
    .filter(n => !query || n.label.toLowerCase().includes(query.toLowerCase()))
    .map(n => ({
      id: n.id,
      label: n.label,
      icon: n.icon,
      section: 'nav' as const,
      action: () => { router.push(n.href); close() }
    }))

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && items[selected]) { items[selected].action() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, items, selected, close])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50" onClick={close} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
        <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(0) }}
              placeholder="Go to..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No results</p>
            )}
            {items.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                    i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  )}
                  onMouseEnter={() => setSelected(i)}
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border flex gap-4 text-xs text-muted-foreground">
            <span><kbd>↑↓</kbd> navigate</span>
            <span><kbd>↵</kbd> select</span>
            <span><kbd>esc</kbd> close</span>
          </div>
        </div>
      </div>
    </>
  )
}
