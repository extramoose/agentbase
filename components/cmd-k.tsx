'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, BookOpen, Users, Clock,
  ArrowRight, Building2, User, Loader2, Hash, Handshake
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEntitySearch, type EntitySearchResult } from '@/hooks/use-entity-search'

type SearchResult = {
  id: string
  label: string
  subtitle?: string
  icon: React.ElementType
  action: () => void
  section: 'nav' | 'tasks' | 'library' | 'crm'
}

const NAV_ITEMS = [
  { id: 'tasks',    label: 'Tasks',    icon: CheckSquare, href: '/tools/tasks' },
  { id: 'library',  label: 'Library',  icon: BookOpen,    href: '/tools/library' },
  { id: 'crm',      label: 'CRM',      icon: Users,       href: '/tools/crm' },
  { id: 'history',  label: 'History',  icon: Clock,       href: '/history' },
]

const ENTITY_ICON: Record<string, React.ElementType> = {
  tasks: CheckSquare,
  library_items: BookOpen,
  companies: Building2,
  people: User,
  deals: Handshake,
}

const ENTITY_SECTION: Record<string, SearchResult['section']> = {
  tasks: 'tasks',
  library_items: 'library',
  companies: 'crm',
  people: 'crm',
  deals: 'crm',
}

function entityRoute(entity: EntitySearchResult): string {
  switch (entity.type) {
    case 'tasks': {
      const ticketId = entity.subtitle?.match(/^Task #(\d+)$/)?.[1]
      return `/tools/tasks/${ticketId ?? entity.id}`
    }
    case 'library_items': return `/tools/library/${entity.id}`
    case 'companies': return `/tools/crm/companies/${entity.id}`
    case 'people': return `/tools/crm/people/${entity.id}`
    case 'deals': return `/tools/crm/deals/${entity.id}`
  }
}

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelected(0)
  }, [])

  // Entity search via shared hook
  const { results: entityResults, loading } = useEntitySearch(query)

  // Map entity results to cmd-k SearchResult format
  const searchResults: SearchResult[] = entityResults.map(entity => ({
    id: `${entity.type}-${entity.id}`,
    label: entity.name,
    subtitle: entity.subtitle,
    icon: ENTITY_ICON[entity.type] ?? Hash,
    section: ENTITY_SECTION[entity.type] ?? 'crm',
    action: () => { router.push(entityRoute(entity)); close() },
  }))

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

  // Build items list
  const navItems: SearchResult[] = NAV_ITEMS
    .filter(n => !query || n.label.toLowerCase().includes(query.toLowerCase()))
    .map(n => ({
      id: n.id,
      label: n.label,
      icon: n.icon,
      section: 'nav' as const,
      action: () => { router.push(n.href); close() },
    }))

  // Combine all items
  const allItems: SearchResult[] = [
    ...navItems,
    ...searchResults,
  ]

  // Group search results by section for display
  const sections: { key: string; title: string; items: SearchResult[] }[] = []

  const navGroup = allItems.filter(i => i.section === 'nav')
  if (navGroup.length > 0) sections.push({ key: 'nav', title: 'Navigation', items: navGroup })

  const taskResults = searchResults.filter(i => i.section === 'tasks')
  if (taskResults.length > 0) sections.push({ key: 'tasks', title: 'Tasks', items: taskResults })

  const libResults = searchResults.filter(i => i.section === 'library')
  if (libResults.length > 0) sections.push({ key: 'library', title: 'Library', items: libResults })

  const crmResults = searchResults.filter(i => i.section === 'crm')
  if (crmResults.length > 0) sections.push({ key: 'crm', title: 'CRM', items: crmResults })

  // Flat list for keyboard navigation
  const flatItems = sections.flatMap(s => s.items)

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatItems.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && flatItems[selected]) { flatItems[selected].action() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, flatItems, selected, close])

  if (!open) return null

  let itemIndex = -1

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
            {loading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />}
            <kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {flatItems.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-6">No results</p>
            )}
            {loading && flatItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Searching...</p>
            )}
            {sections.map(section => (
              <div key={section.key}>
                {searchResults.length > 0 && (
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </div>
                )}
                {section.items.map(item => {
                  itemIndex++
                  const idx = itemIndex
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                        idx === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      )}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{item.subtitle && item.section === 'tasks' ? <>{item.subtitle} — {item.label}</> : item.label}</span>
                        {item.subtitle && (
                          <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
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
