'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, BookOpen, Users, Clock,
  ArrowRight, Building2, User, Loader2, Hash
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

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

const TASK_NUM_RE = /^#?(\d+)$/

export function CmdK() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const router = useRouter()

  // Toggle on Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        setQuery('')
        setSelected(0)
        setSearchResults([])
        setLoading(false)
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
    setSearchResults([])
    setLoading(false)
  }, [])

  // Detect task number pattern
  const taskNumMatch = query.match(TASK_NUM_RE)
  const taskNum = taskNumMatch ? parseInt(taskNumMatch[1], 10) : null

  // Entity search (debounced, 3+ chars, non-number queries)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 3 || TASK_NUM_RE.test(trimmed)) {
      setSearchResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    debounceRef.current = setTimeout(async () => {
      const supabase = createClient()
      const pattern = `%${trimmed}%`

      const [tasksRes, libraryRes, companiesRes, peopleRes] = await Promise.all([
        supabase.from('tasks').select('id,title,ticket_id').ilike('title', pattern).limit(5),
        supabase.from('library_items').select('id,title').ilike('title', pattern).limit(3),
        supabase.from('companies').select('id,name').ilike('name', pattern).limit(3),
        supabase.from('people').select('id,name').ilike('name', pattern).limit(3),
      ])

      const results: SearchResult[] = []

      if (tasksRes.data) {
        for (const t of tasksRes.data) {
          results.push({
            id: `task-${t.id}`,
            label: t.title,
            subtitle: `Task #${t.ticket_id}`,
            icon: CheckSquare,
            section: 'tasks',
            action: () => { router.push(`/tools/tasks/${t.ticket_id}`); close() },
          })
        }
      }

      if (libraryRes.data) {
        for (const l of libraryRes.data) {
          results.push({
            id: `lib-${l.id}`,
            label: l.title,
            subtitle: 'Library',
            icon: BookOpen,
            section: 'library',
            action: () => { router.push(`/tools/library/${l.id}`); close() },
          })
        }
      }

      if (companiesRes.data) {
        for (const c of companiesRes.data) {
          results.push({
            id: `company-${c.id}`,
            label: c.name,
            subtitle: 'Company',
            icon: Building2,
            section: 'crm',
            action: () => { router.push(`/tools/crm/companies/${c.id}`); close() },
          })
        }
      }

      if (peopleRes.data) {
        for (const p of peopleRes.data) {
          results.push({
            id: `person-${p.id}`,
            label: p.name,
            subtitle: 'Person',
            icon: User,
            section: 'crm',
            action: () => { router.push(`/tools/crm/people/${p.id}`); close() },
          })
        }
      }

      setSearchResults(results)
      setLoading(false)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, router, close])

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

  // Task number jump item
  const taskJumpItem: SearchResult | null = taskNum !== null
    ? {
        id: `jump-task-${taskNum}`,
        label: `Jump to task #${taskNum}`,
        subtitle: 'Task lookup',
        icon: Hash,
        section: 'tasks' as const,
        action: async () => {
          const supabase = createClient()
          const { data } = await supabase
            .from('tasks')
            .select('id,title,ticket_id')
            .eq('ticket_id', taskNum)
            .single()
          if (data) {
            router.push(`/tools/tasks/${data.ticket_id}`)
          }
          close()
        },
      }
    : null

  // Combine all items
  const allItems: SearchResult[] = [
    ...(taskJumpItem ? [taskJumpItem] : []),
    ...navItems,
    ...searchResults,
  ]

  // Group search results by section for display
  const sections: { key: string; title: string; items: SearchResult[] }[] = []

  const taskJumpItems = allItems.filter(i => i.id.startsWith('jump-task-'))
  if (taskJumpItems.length > 0) sections.push({ key: 'jump', title: 'Quick Jump', items: taskJumpItems })

  const navGroup = allItems.filter(i => i.section === 'nav')
  if (navGroup.length > 0) sections.push({ key: 'nav', title: 'Navigation', items: navGroup })

  const taskResults = searchResults.filter(i => i.section === 'tasks')
  if (taskResults.length > 0) sections.push({ key: 'tasks', title: 'Tasks', items: taskResults })

  const libResults = searchResults.filter(i => i.section === 'library')
  if (libResults.length > 0) sections.push({ key: 'library', title: 'Library', items: libResults })

  const crmResults = searchResults.filter(i => i.section === 'crm')
  if (crmResults.length > 0) sections.push({ key: 'crm', title: 'People & Companies', items: crmResults })

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
                        <span className="truncate block">{item.label}</span>
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
