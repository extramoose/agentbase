'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Building2, Plus, Trash2, User, Handshake, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { EntityGrid } from '@/components/entity-client/entity-grid'
import { ViewToggle } from '@/components/entity-client/view-toggle'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { batchCreateLinks } from '@/components/entity-client/link-picker'
import { AssigneePicker } from '@/components/assignee-picker'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/rich-text-editor'
import { UnfurlInput } from '@/components/unfurl-input'
import { cn } from '@/lib/utils'
import { type BaseEntity, type EntityType } from '@/types/entities'
import { type EntitySearchResult } from '@/hooks/use-entity-search'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabelValue {
  label: string
  value: string
}

export interface CrmCompany extends BaseEntity {
  name: string
  domain: string | null
  industry: string | null
  notes: string | null
  website: string | null
  linkedin: string | null
  twitter: string | null
  instagram: string | null
  location: string | null
  source: string | null
  last_enriched: string | null
}

export interface CrmPerson extends BaseEntity {
  name: string
  email: string | null
  phone: string | null
  title: string | null
  notes: string | null
  emails: LabelValue[]
  phones: LabelValue[]
  linkedin: string | null
  twitter: string | null
  instagram: string | null
  source: string | null
  last_enriched: string | null
}

type DealStatus = 'cold' | 'prospect' | 'warm' | 'active' | 'won' | 'lost' | 'paused' | 'archived'

export interface CrmDeal extends BaseEntity {
  title: string
  status: DealStatus
  value: number | null
  notes: string | null
  follow_up_date: string | null
  source: string | null
  primary_contact_id: string | null
  expected_close_date: string | null
  last_enriched: string | null
}

type Section = 'deals' | 'companies' | 'people'
type View = 'grid' | 'table' | 'stickies'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEAL_STATUS_CONFIG: Record<DealStatus, { label: string; className: string; funnelColor: string }> = {
  cold:     { label: 'Cold',     className: 'bg-gray-500/20 text-gray-400',    funnelColor: 'bg-gray-500' },
  prospect: { label: 'Prospect', className: 'bg-slate-500/20 text-slate-400',  funnelColor: 'bg-slate-500' },
  warm:     { label: 'Warm',     className: 'bg-amber-500/20 text-amber-400',  funnelColor: 'bg-amber-500' },
  active:   { label: 'Active',   className: 'bg-blue-500/20 text-blue-400',    funnelColor: 'bg-blue-500' },
  won:      { label: 'Won',      className: 'bg-green-500/20 text-green-400',  funnelColor: 'bg-green-500' },
  lost:     { label: 'Lost',     className: 'bg-red-500/20 text-red-400',      funnelColor: 'bg-red-500' },
  paused:   { label: 'Paused',   className: 'bg-yellow-500/20 text-yellow-400', funnelColor: 'bg-yellow-500' },
  archived: { label: 'Archived', className: 'bg-neutral-500/20 text-neutral-400', funnelColor: 'bg-neutral-500' },
}

const DEAL_STATUS_ORDER: DealStatus[] = ['cold', 'prospect', 'warm', 'active', 'won', 'lost', 'paused', 'archived']

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: 'deals', label: 'Deals' },
  { value: 'companies', label: 'Companies' },
  { value: 'people', label: 'People' },
]

type EntityLinkChip = { type: string; id: string; name: string; seq_id: number | null }

const LINK_CHIP_COLORS: Record<string, string> = {
  tasks:         'bg-blue-500/20 text-blue-400',
  library_items: 'bg-yellow-500/20 text-yellow-400',
  companies:     'bg-red-500/20 text-red-400',
  people:        'bg-pink-500/20 text-pink-400',
  deals:         'bg-emerald-500/20 text-emerald-400',
}

const LINK_CHIP_LABELS: Record<string, string> = {
  tasks: 'Task', library_items: 'Library', companies: 'Co', people: 'Person', deals: 'Deal',
}

const LINK_CHIP_PATHS: Record<string, string> = {
  tasks:         '/tools/tasks',
  library_items: '/tools/library',
  companies:     '/tools/crm/companies',
  people:        '/tools/crm/people',
  deals:         '/tools/crm/deals',
}

function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

// ---------------------------------------------------------------------------
// Main CRM Client
// ---------------------------------------------------------------------------

export function CrmClient({
  initialCompanies,
  initialPeople,
  initialDeals,
  initialSection,
  initialSelectedId,
}: {
  initialCompanies: CrmCompany[]
  initialPeople: CrmPerson[]
  initialDeals: CrmDeal[]
  initialSection?: string
  initialSelectedId?: number
}) {
  // ----- Entity state -----
  const [companies, setCompanies] = useState<CrmCompany[]>(initialCompanies)
  const [people, setPeople] = useState<CrmPerson[]>(initialPeople)
  const [deals, setDeals] = useState<CrmDeal[]>(initialDeals)

  // ----- UI state -----
  const validSections: Section[] = ['deals', 'companies', 'people']
  const resolvedSection = validSections.includes(initialSection as Section)
    ? (initialSection as Section)
    : 'deals'
  const [section, setSection] = useState<Section>(resolvedSection)
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null)
  const [view, setView] = useState<View>('table')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [dealStatusFilter, setDealStatusFilter] = useState<DealStatus | 'all'>('all')
  const [entityLinksMap, setEntityLinksMap] = useState<Record<string, Array<{ type: string; id: string; name: string; seq_id: number | null }>>>({})
  const addInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  // ----- Read URL params on mount -----
  useEffect(() => {
    const idParam = readParam('id')
    if (idParam) {
      const n = Number(idParam)
      if (!Number.isNaN(n)) setSelectedId(n)
    }
    const viewParam = readParam('view')
    if (viewParam === 'grid') setView('grid')
    const qParam = readParam('q')
    if (qParam) setSearch(qParam)
    const tagParam = readParam('tag')
    if (tagParam) setSelectedTag(tagParam)
  }, [])

  // ----- Focus add input when showing -----
  useEffect(() => {
    if (adding) addInputRef.current?.focus()
  }, [adding])

  // ----- Realtime subscriptions for ALL three tables -----
  useEffect(() => {
    const companiesChannel = supabase
      .channel('crm:companies:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'companies' }, (payload) => {
        const row = payload.new as CrmCompany
        setCompanies((prev) => prev.some((c) => c.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'companies' }, (payload) => {
        const row = payload.new as CrmCompany
        setCompanies((prev) => prev.map((c) => (c.id === row.id ? row : c)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'companies' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setCompanies((prev) => prev.filter((c) => c.id !== id))
      })
      .subscribe()

    const peopleChannel = supabase
      .channel('crm:people:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'people' }, (payload) => {
        const row = payload.new as CrmPerson
        setPeople((prev) => prev.some((p) => p.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, (payload) => {
        const row = payload.new as CrmPerson
        setPeople((prev) => prev.map((p) => (p.id === row.id ? row : p)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'people' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setPeople((prev) => prev.filter((p) => p.id !== id))
      })
      .subscribe()

    const dealsChannel = supabase
      .channel('crm:deals:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deals' }, (payload) => {
        const row = payload.new as CrmDeal
        setDeals((prev) => prev.some((d) => d.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deals' }, (payload) => {
        const row = payload.new as CrmDeal
        setDeals((prev) => prev.map((d) => (d.id === row.id ? row : d)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'deals' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setDeals((prev) => prev.filter((d) => d.id !== id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(companiesChannel)
      supabase.removeChannel(peopleChannel)
      supabase.removeChannel(dealsChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ----- Fetch entity links for CRM entities -----
  useEffect(() => {
    async function fetchLinks() {
      const { data } = await supabase
        .from('entity_links')
        .select('source_type, source_id, target_type, target_id')
        .in('source_type', ['companies', 'people', 'deals'])
        .in('target_type', ['companies', 'people', 'deals'])
      if (!data) return

      // Build name lookup from in-memory entities
      const nameMap = new Map<string, { name: string; seq_id: number | null }>()
      for (const c of companies) nameMap.set(c.id, { name: c.name, seq_id: c.seq_id })
      for (const p of people) nameMap.set(p.id, { name: p.name, seq_id: p.seq_id })
      for (const d of deals) nameMap.set(d.id, { name: d.title, seq_id: d.seq_id })

      const map: Record<string, Array<{ type: string; id: string; name: string; seq_id: number | null }>> = {}
      for (const link of data as Array<{ source_type: string; source_id: string; target_type: string; target_id: string }>) {
        // Skip self-links
        if (link.source_id === link.target_id) continue
        const resolved = nameMap.get(link.target_id)
        if (!resolved) continue
        const arr = map[link.source_id] ?? []
        // Avoid duplicate chips for the same target
        if (!arr.some((l) => l.id === link.target_id && l.type === link.target_type)) {
          arr.push({ type: link.target_type, id: link.target_id, name: resolved.name, seq_id: resolved.seq_id })
        }
        map[link.source_id] = arr
      }
      setEntityLinksMap(map)
    }
    fetchLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.length, people.length, deals.length])

  // ----- CRUD operations -----

  const updateEntity = useCallback(
    async (table: 'companies' | 'people' | 'deals', id: string, fields: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, id, fields }),
        })
        const json: Record<string, unknown> = await res.json()
        if (!res.ok) throw new Error((json.error as string) ?? 'Update failed')
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
      }
    },
    [],
  )

  const deleteEntity = useCallback(
    async (table: 'companies' | 'people' | 'deals', id: string) => {
      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, id }),
        })
        const json: Record<string, unknown> = await res.json()
        if (!res.ok) throw new Error((json.error as string) ?? 'Delete failed')
        toast({ type: 'success', message: 'Deleted' })
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      }
    },
    [],
  )

  const createCompany = useCallback(async (name: string, links?: EntitySearchResult[]) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmCompany = {
      id: tempId, seq_id: null, tenant_id: '', name, domain: null, industry: null, notes: null,
      website: null, linkedin: null, twitter: null, instagram: null, location: null, source: null,
      last_enriched: null, tags: [], assignee_id: null, assignee_type: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setCompanies((prev) => [optimistic, ...prev])
    try {
      const res = await fetch('/api/commands/create-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json: Record<string, unknown> = await res.json()
      if (!res.ok) throw new Error((json.error as string) ?? 'Failed to create company')
      const created = json.data as CrmCompany
      setCompanies((prev) => prev.map((c) => (c.id === tempId ? created : c)))
      if (links?.length) batchCreateLinks('companies', created.id, links)
      toast({ type: 'success', message: 'Company created' })
    } catch (err) {
      setCompanies((prev) => prev.filter((c) => c.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create company' })
    }
  }, [])

  const createPerson = useCallback(async (name: string, links?: EntitySearchResult[]) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmPerson = {
      id: tempId, seq_id: null, tenant_id: '', name, email: null, phone: null, title: null, notes: null,
      emails: [], phones: [], linkedin: null, twitter: null, instagram: null, source: null,
      last_enriched: null, tags: [], assignee_id: null, assignee_type: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setPeople((prev) => [optimistic, ...prev])
    try {
      const res = await fetch('/api/commands/create-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json: Record<string, unknown> = await res.json()
      if (!res.ok) throw new Error((json.error as string) ?? 'Failed to create person')
      const created = json.data as CrmPerson
      setPeople((prev) => prev.map((p) => (p.id === tempId ? created : p)))
      if (links?.length) batchCreateLinks('people', created.id, links)
      toast({ type: 'success', message: 'Person created' })
    } catch (err) {
      setPeople((prev) => prev.filter((p) => p.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create person' })
    }
  }, [])

  const createDeal = useCallback(async (dealTitle: string, links?: EntitySearchResult[]) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmDeal = {
      id: tempId, seq_id: null, tenant_id: '', title: dealTitle, status: 'prospect', value: null, notes: null,
      follow_up_date: null, source: null, primary_contact_id: null, expected_close_date: null,
      last_enriched: null, tags: [], assignee_id: null, assignee_type: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setDeals((prev) => [optimistic, ...prev])
    try {
      const res = await fetch('/api/commands/create-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: dealTitle }),
      })
      const json: Record<string, unknown> = await res.json()
      if (!res.ok) throw new Error((json.error as string) ?? 'Failed to create deal')
      const created = json.data as CrmDeal
      setDeals((prev) => prev.map((d) => (d.id === tempId ? created : d)))
      if (links?.length) batchCreateLinks('deals', created.id, links)
      toast({ type: 'success', message: 'Deal created' })
    } catch (err) {
      setDeals((prev) => prev.filter((d) => d.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create deal' })
    }
  }, [])

  // ----- Derived: selected entity -----

  const entityType: EntityType =
    section === 'deals' ? 'deal' : section === 'companies' ? 'company' : 'person'

  const selectedEntity = useMemo(() => {
    if (selectedId === null) return null
    if (section === 'deals') return deals.find((d) => d.seq_id === selectedId) ?? null
    if (section === 'companies') return companies.find((c) => c.seq_id === selectedId) ?? null
    return people.find((p) => p.seq_id === selectedId) ?? null
  }, [selectedId, section, deals, companies, people])

  // ----- Derived: all tags from current section -----

  const allTags = useMemo(() => {
    const entities =
      section === 'deals' ? deals : section === 'companies' ? companies : people
    const tagCount = new Map<string, number>()
    for (const e of entities) {
      for (const t of e.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
    }
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
  }, [section, deals, companies, people])

  // ----- Filtered entities per section -----

  function applyCrmSort<T>(arr: T[]): T[] {
    if (!sortKey) return arr
    return [...arr].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  const filteredDeals = useMemo(() => {
    let result = deals
    if (dealStatusFilter !== 'all') {
      result = result.filter((d) => d.status === dealStatusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (selectedTag) {
      result = result.filter((d) => d.tags.includes(selectedTag))
    }
    return applyCrmSort(result)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, dealStatusFilter, search, selectedTag, sortKey, sortDir])

  const filteredCompanies = useMemo(() => {
    let result = companies
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.domain?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (selectedTag) {
      result = result.filter((c) => c.tags.includes(selectedTag))
    }
    return applyCrmSort(result)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, selectedTag, sortKey, sortDir])

  const filteredPeople = useMemo(() => {
    let result = people
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (selectedTag) {
      result = result.filter((p) => p.tags.includes(selectedTag))
    }
    return applyCrmSort(result)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, search, selectedTag, sortKey, sortDir])

  const hasResults =
    section === 'deals'
      ? true // always show status sections for deals
      : section === 'companies'
        ? filteredCompanies.length > 0
        : filteredPeople.length > 0

  // ----- URL sync for filters (replaceState — no new history entry) -----

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (selectedId !== null) params.set('id', String(selectedId))
    else params.delete('id')
    if (search) params.set('q', search)
    else params.delete('q')
    if (selectedTag) params.set('tag', selectedTag)
    else params.delete('tag')
    const qs = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )
  }, [search, selectedTag, selectedId])

  // ----- Shelf open / close with pushState -----

  const openShelf = useCallback((entity: BaseEntity) => {
    if (entity.seq_id === null) return
    setSelectedId(entity.seq_id)
    const params = new URLSearchParams(window.location.search)
    params.set('id', String(entity.seq_id))
    const qs = params.toString()
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )
  }, [])

  const closeShelf = useCallback(() => {
    setSelectedId(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('id')
    const qs = params.toString()
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )
  }, [])

  // ----- popstate handler (browser back/forward) -----

  useEffect(() => {
    const handler = () => {
      const path = window.location.pathname
      const match = path.match(/\/tools\/crm\/(deals|companies|people)/)
      if (match) setSection(match[1] as Section)

      const idParam = new URLSearchParams(window.location.search).get('id')
      if (idParam) {
        const n = Number(idParam)
        if (!Number.isNaN(n)) {
          setSelectedId(n)
          return
        }
      }
      setSelectedId(null)
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // ----- Tab switching -----

  const switchSection = useCallback((newSection: Section) => {
    setSection(newSection)
    setSelectedId(null)
    setSearch('')
    setSelectedTag(null)
    setAdding(false)
    setNewName('')
    setSortKey(null)
    setSortDir('asc')
    setDealStatusFilter('all')
    window.history.pushState(null, '', `/tools/crm/${newSection}`)
  }, [])

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return key
      }
      setSortDir('asc')
      return key
    })
  }, [])

  // ----- Quick-add handler -----

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (section === 'companies') createCompany(trimmed)
    else if (section === 'people') createPerson(trimmed)
    else createDeal(trimmed)
    setNewName('')
    setAdding(false)
  }

  // ----- Entity update/delete handlers (used in shelves) -----

  const handleUpdate = useCallback(
    (id: string, fields: Record<string, unknown>) => {
      const table =
        section === 'companies' ? 'companies' as const
        : section === 'people' ? 'people' as const
        : 'deals' as const
      if (section === 'companies') {
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === id
              ? ({ ...c, ...fields, updated_at: new Date().toISOString() } as CrmCompany)
              : c,
          ),
        )
      } else if (section === 'people') {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === id
              ? ({ ...p, ...fields, updated_at: new Date().toISOString() } as CrmPerson)
              : p,
          ),
        )
      } else {
        setDeals((prev) =>
          prev.map((d) =>
            d.id === id
              ? ({ ...d, ...fields, updated_at: new Date().toISOString() } as CrmDeal)
              : d,
          ),
        )
      }
      updateEntity(table, id, fields)
    },
    [section, updateEntity],
  )

  const handleDelete = useCallback(
    (id: string) => {
      const table =
        section === 'companies' ? 'companies' as const
        : section === 'people' ? 'people' as const
        : 'deals' as const
      setSelectedId(null)
      if (section === 'companies') {
        setCompanies((prev) => prev.filter((c) => c.id !== id))
      } else if (section === 'people') {
        setPeople((prev) => prev.filter((p) => p.id !== id))
      } else {
        setDeals((prev) => prev.filter((d) => d.id !== id))
      }
      deleteEntity(table, id)
      const params = new URLSearchParams(window.location.search)
      params.delete('id')
      const qs = params.toString()
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}`,
      )
    },
    [section, deleteEntity],
  )

  const handleTagChange = useCallback((tag: string | null) => {
    setSelectedTag(tag)
  }, [])

  // ----- Labels -----

  const entityLabel =
    section === 'companies' ? 'Company' : section === 'people' ? 'Person' : 'Deal'
  const entityLabelPlural =
    section === 'companies' ? 'companies' : section === 'people' ? 'people' : 'deals'

  const shelfTitle = useMemo(() => {
    if (!selectedEntity) return ''
    if (section === 'deals') return (selectedEntity as CrmDeal).title
    if (section === 'companies') return (selectedEntity as CrmCompany).name
    return (selectedEntity as CrmPerson).name
  }, [selectedEntity, section])

  // ----- Render -----

  return (
    <div className="flex flex-col h-full">
      {/* Tab navigation: Deals | Companies | People */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2 overflow-x-auto">
        {SECTIONS.map((s) => {
          const count =
            s.value === 'deals'
              ? deals.length
              : s.value === 'companies'
                ? companies.length
                : people.length
          return (
            <button
              key={s.value}
              onClick={() => switchSection(s.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                section === s.value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {s.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search + filters + view toggle + add button */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder={`Search ${entityLabelPlural}...`}
          tags={allTags}
          selectedTag={selectedTag}
          onTagChange={handleTagChange}
        />
        <ViewToggle onChange={setView} />
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Add {entityLabel}</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Quick-add input */}
      {adding && (
        <div className="flex items-center gap-2 mb-4">
          <Input
            ref={addInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') {
                setAdding(false)
                setNewName('')
              }
            }}
            placeholder={
              section === 'companies'
                ? 'Company name'
                : section === 'people'
                  ? 'Person name'
                  : 'Deal title'
            }
            className="flex-1 max-w-md"
          />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false)
              setNewName('')
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Deal status filter + funnel (deals section only) */}
      {section === 'deals' && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {(['all', ...DEAL_STATUS_ORDER] as const).map((s) => {
              const count = s === 'all'
                ? deals.length
                : deals.filter((d) => d.status === s).length
              const cfg = s !== 'all' ? DEAL_STATUS_CONFIG[s] : null
              return (
                <button
                  key={s}
                  onClick={() => setDealStatusFilter(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    dealStatusFilter === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {cfg?.label ?? 'All'} ({count})
                </button>
              )
            })}
          </div>
          <DealFunnel deals={deals} />
        </>
      )}

      {/* List view */}
      <div className="flex-1 overflow-y-auto">
        {!hasResults ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No {entityLabelPlural} found</p>
          </div>
        ) : view === 'grid' ? (
          section === 'deals' ? (
            <div className="space-y-4">
              {(dealStatusFilter === 'all' ? DEAL_STATUS_ORDER : [dealStatusFilter]).map((status) => {
                const cfg = DEAL_STATUS_CONFIG[status]
                const groupDeals = filteredDeals.filter((d) => d.status === status)
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                      <span className="text-xs text-muted-foreground">({groupDeals.length})</span>
                    </div>
                    {groupDeals.length > 0 ? (
                      <EntityGrid>
                        {groupDeals.map((d) => (
                          <DealGridCard key={d.id} deal={d} onClick={() => openShelf(d)} />
                        ))}
                      </EntityGrid>
                    ) : (
                      <p className="text-xs text-muted-foreground/60 py-2">No items</p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <EntityGrid>
              {section === 'companies' &&
                filteredCompanies.map((c) => (
                  <CompanyGridCard key={c.id} company={c} onClick={() => openShelf(c)} />
                ))}
              {section === 'people' &&
                filteredPeople.map((p) => (
                  <PersonGridCard key={p.id} person={p} onClick={() => openShelf(p)} />
                ))}
            </EntityGrid>
          )
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {section === 'deals' && (
                    <>
                      <SortTh colKey="title" label="Title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="value" label="Value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Links</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                      <SortTh colKey="created_at" label="Created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </>
                  )}
                  {section === 'companies' && (
                    <>
                      <SortTh colKey="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="domain" label="Domain" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="industry" label="Industry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Links</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                      <SortTh colKey="created_at" label="Created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </>
                  )}
                  {section === 'people' && (
                    <>
                      <SortTh colKey="name" label="Name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="email" label="Email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortTh colKey="title" label="Title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Links</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {section === 'deals' &&
                  (dealStatusFilter === 'all' ? DEAL_STATUS_ORDER : [dealStatusFilter]).map((status) => {
                    const cfg = DEAL_STATUS_CONFIG[status]
                    const groupDeals = filteredDeals.filter((d) => d.status === status)
                    return (
                      <Fragment key={status}>
                        <tr className="bg-muted/20">
                          <td colSpan={6} className="px-4 py-1.5">
                            <span className="text-xs font-medium">{cfg.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">({groupDeals.length})</span>
                          </td>
                        </tr>
                        {groupDeals.length > 0 ? (
                          groupDeals.map((d) => (
                            <DealTableRow key={d.id} deal={d} links={entityLinksMap[d.id]} onClick={() => openShelf(d)} />
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-1.5 text-xs text-muted-foreground/60">No items</td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                {section === 'companies' &&
                  filteredCompanies.map((c) => (
                    <CompanyTableRow key={c.id} company={c} links={entityLinksMap[c.id]} onClick={() => openShelf(c)} />
                  ))}
                {section === 'people' &&
                  filteredPeople.map((p) => (
                    <PersonTableRow key={p.id} person={p} links={entityLinksMap[p.id]} onClick={() => openShelf(p)} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shelf */}
      {selectedEntity && (
        <EntityShelf
          entity={selectedEntity}
          entityType={entityType}
          onClose={closeShelf}
          title={shelfTitle}
          headerRight={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(selectedEntity.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        >
          {section === 'deals' && (
            <DealShelfContent
              deal={selectedEntity as CrmDeal}
              onUpdate={(fields) => handleUpdate(selectedEntity.id, fields)}
            />
          )}
          {section === 'companies' && (
            <CompanyShelfContent
              company={selectedEntity as CrmCompany}
              onUpdate={(fields) => handleUpdate(selectedEntity.id, fields)}
            />
          )}
          {section === 'people' && (
            <PersonShelfContent
              person={selectedEntity as CrmPerson}
              onUpdate={(fields) => handleUpdate(selectedEntity.id, fields)}
            />
          )}
        </EntityShelf>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable table header
// ---------------------------------------------------------------------------

function SortTh({
  colKey,
  label,
  sortKey,
  sortDir,
  onSort,
}: {
  colKey: string
  label: string
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  onSort: (key: string) => void
}) {
  const active = sortKey === colKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className="px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />
        }
      </span>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Deal Funnel Visualization
// ---------------------------------------------------------------------------

function DealFunnel({ deals }: { deals: CrmDeal[] }) {
  const stages = DEAL_STATUS_ORDER

  const counts = useMemo(() => {
    const map = Object.fromEntries(
      DEAL_STATUS_ORDER.map((s) => [s, { count: 0, value: 0 }])
    ) as Record<DealStatus, { count: number; value: number }>
    for (const d of deals) {
      if (d.status in map) {
        map[d.status].count++
        map[d.status].value += Number(d.value ?? 0)
      }
    }
    return map
  }, [deals])

  const total = deals.length
  if (total === 0) return null

  return (
    <div className="mb-4">
      <div className="flex h-10 rounded-md overflow-hidden">
        {stages.map((stage) => {
          const { count, value } = counts[stage]
          if (count === 0) return null
          const pct = (count / total) * 100
          const cfg = DEAL_STATUS_CONFIG[stage]
          return (
            <div
              key={stage}
              className={cn(
                'flex flex-col items-center justify-center text-white',
                cfg.funnelColor,
              )}
              style={{ width: `${pct}%`, minWidth: count > 0 ? '64px' : undefined }}
              title={`${cfg.label}: ${count} deal${count !== 1 ? 's' : ''} — $${value.toLocaleString()}`}
            >
              <span className="text-xs font-semibold leading-tight">{cfg.label} {count}</span>
              {value > 0 && (
                <span className="text-[10px] leading-tight opacity-80">${value.toLocaleString()}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid Cards
// ---------------------------------------------------------------------------

function DealGridCard({ deal, onClick }: { deal: CrmDeal; onClick: () => void }) {
  const statusCfg = DEAL_STATUS_CONFIG[deal.status]
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card p-4 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Handshake className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{deal.title}</span>
        </div>
        <Badge variant="secondary" className={cn('text-xs shrink-0', statusCfg.className)}>
          {statusCfg.label}
        </Badge>
      </div>
      {deal.value != null && (
        <p className="text-sm text-muted-foreground mb-2">
          ${Number(deal.value).toLocaleString()}
        </p>
      )}
      {deal.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {deal.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {deal.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{deal.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

function CompanyGridCard({ company, onClick }: { company: CrmCompany; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card p-4 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{company.name}</span>
      </div>
      {company.domain && (
        <p className="text-xs text-muted-foreground mb-1 truncate">{company.domain}</p>
      )}
      {company.industry && (
        <p className="text-xs text-muted-foreground mb-2">{company.industry}</p>
      )}
      {company.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {company.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {company.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{company.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

function PersonGridCard({ person, onClick }: { person: CrmPerson; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card p-4 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{person.name}</span>
      </div>
      {person.email && (
        <p className="text-xs text-muted-foreground mb-1 truncate">{person.email}</p>
      )}
      {person.title && (
        <p className="text-xs text-muted-foreground mb-2">{person.title}</p>
      )}
      {person.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {person.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {person.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">+{person.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linked Entity Chips (shared by table rows)
// ---------------------------------------------------------------------------

const MAX_VISIBLE_CHIPS = 2

function LinkedEntityChips({ links }: { links?: EntityLinkChip[] }) {
  if (!links || links.length === 0) return <span className="text-muted-foreground">{'\u2014'}</span>

  const visible = links.slice(0, MAX_VISIBLE_CHIPS)
  const remaining = links.length - MAX_VISIBLE_CHIPS

  return (
    <div className="flex gap-1 items-center overflow-hidden">
      {visible.map((link) => {
        const colors = LINK_CHIP_COLORS[link.type] ?? 'bg-zinc-500/20 text-zinc-400'
        const label = LINK_CHIP_LABELS[link.type] ?? link.type
        const basePath = LINK_CHIP_PATHS[link.type]
        const href = basePath && link.seq_id != null ? `${basePath}?id=${link.seq_id}` : null

        const inner = (
          <>
            <span className={cn('rounded px-1 py-0 text-[10px] font-medium leading-tight', colors)}>
              {label}
            </span>
            <span className="truncate">{link.name}</span>
          </>
        )

        return href ? (
          <Link
            key={`${link.type}:${link.id}`}
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors max-w-[140px] shrink-0"
          >
            {inner}
          </Link>
        ) : (
          <span
            key={`${link.type}:${link.id}`}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground max-w-[140px] shrink-0"
          >
            {inner}
          </span>
        )
      })}
      {remaining > 0 && (
        <span className="text-xs text-muted-foreground shrink-0">+{remaining}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table Rows
// ---------------------------------------------------------------------------

function DealTableRow({ deal, links, onClick }: { deal: CrmDeal; links?: EntityLinkChip[]; onClick: () => void }) {
  const statusCfg = DEAL_STATUS_CONFIG[deal.status]
  return (
    <tr
      onClick={onClick}
      className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Handshake className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{deal.title}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        <Badge variant="secondary" className={cn('text-xs', statusCfg.className)}>
          {statusCfg.label}
        </Badge>
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {deal.value != null ? `$${Number(deal.value).toLocaleString()}` : '\u2014'}
      </td>
      <td className="px-4 py-2">
        <LinkedEntityChips links={links} />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1 overflow-hidden">
          {deal.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 shrink-0">
              {tag}
            </Badge>
          ))}
          {deal.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">+{deal.tags.length - 2}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {new Date(deal.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}
      </td>
    </tr>
  )
}

function CompanyTableRow({ company, links, onClick }: { company: CrmCompany; links?: EntityLinkChip[]; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{company.name}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-muted-foreground truncate">{company.domain ?? '\u2014'}</td>
      <td className="px-4 py-2 text-muted-foreground truncate">{company.industry ?? '\u2014'}</td>
      <td className="px-4 py-2">
        <LinkedEntityChips links={links} />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1 overflow-hidden">
          {company.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 shrink-0">
              {tag}
            </Badge>
          ))}
          {company.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{company.tags.length - 2}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground">
        {new Date(company.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
      </td>
    </tr>
  )
}

function PersonTableRow({ person, links, onClick }: { person: CrmPerson; links?: EntityLinkChip[]; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{person.name}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-muted-foreground truncate">{person.email ?? '\u2014'}</td>
      <td className="px-4 py-2 text-muted-foreground truncate">{person.title ?? '\u2014'}</td>
      <td className="px-4 py-2">
        <LinkedEntityChips links={links} />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1 overflow-hidden">
          {person.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 shrink-0">
              {tag}
            </Badge>
          ))}
          {person.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">+{person.tags.length - 2}</span>
          )}
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Label+Value List (for emails/phones arrays)
// ---------------------------------------------------------------------------

function LabelValueListField({
  label,
  items,
  onChange,
  valuePlaceholder,
}: {
  label: string
  items: LabelValue[]
  onChange: (items: LabelValue[]) => void
  valuePlaceholder?: string
}) {
  function updateItem(index: number, field: 'label' | 'value', val: string) {
    const updated = items.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    onChange(updated)
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  function addItem() {
    onChange([...items, { label: '', value: '' }])
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1 block">{label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={item.label}
              onChange={(e) => updateItem(i, 'label', e.target.value)}
              placeholder="Label"
              className="text-sm w-24 shrink-0"
            />
            <Input
              value={item.value}
              onChange={(e) => updateItem(i, 'value', e.target.value)}
              placeholder={valuePlaceholder}
              className="text-sm flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(i)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-7"
          onClick={addItem}
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shelf Content — Deal
// ---------------------------------------------------------------------------

export function DealShelfContent({
  deal,
  onUpdate,
}: {
  deal: CrmDeal
  onUpdate: (fields: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(deal.title)
  const [status, setStatus] = useState<DealStatus>(deal.status)
  const [value, setValue] = useState(deal.value != null ? String(deal.value) : '')
  const [notes, setNotes] = useState(deal.notes ?? '')
  const [tags, setTags] = useState<string[]>(deal.tags)
  const [followUpDate, setFollowUpDate] = useState(deal.follow_up_date ?? '')
  const [dealSource, setDealSource] = useState(deal.source ?? '')
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal.expected_close_date ?? '')

  useEffect(() => {
    setTitle(deal.title)
    setStatus(deal.status)
    setValue(deal.value != null ? String(deal.value) : '')
    setNotes(deal.notes ?? '')
    setTags(deal.tags)
    setFollowUpDate(deal.follow_up_date ?? '')
    setDealSource(deal.source ?? '')
    setExpectedCloseDate(deal.expected_close_date ?? '')
  }, [deal])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => saveField({ title: e.target.value })}
          className="text-base font-medium"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Status</label>
          <select
            value={status}
            onChange={(e) => {
              const val = e.target.value as DealStatus
              setStatus(val)
              saveField({ status: val })
            }}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          >
            {(Object.keys(DEAL_STATUS_CONFIG) as DealStatus[]).map((s) => (
              <option key={s} value={s}>
                {DEAL_STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Value</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value
                const num = v ? parseFloat(v) : null
                if (v === '' || (num !== null && !isNaN(num))) {
                  saveField({ value: num })
                }
              }}
              placeholder="0.00"
              className="text-sm pl-7"
              type="number"
              step="0.01"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Follow-up Date</label>
          <Input
            type="date"
            value={followUpDate}
            onChange={(e) => {
              setFollowUpDate(e.target.value)
              saveField({ follow_up_date: e.target.value || null })
            }}
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Expected Close</label>
          <Input
            type="date"
            value={expectedCloseDate}
            onChange={(e) => {
              setExpectedCloseDate(e.target.value)
              saveField({ expected_close_date: e.target.value || null })
            }}
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Source</label>
        <Input
          value={dealSource}
          onChange={(e) => setDealSource(e.target.value)}
          onBlur={(e) => saveField({ source: e.target.value || null })}
          placeholder="e.g. referral, cold, event, inbound"
          className="text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
        <RichTextEditor
          value={notes}
          onBlur={(md) => {
            setNotes(md)
            saveField({ notes: md || null })
          }}
          placeholder="Add notes..."
          minHeight="100px"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
        <TagCombobox
          selected={tags}
          onChange={(newTags) => {
            setTags(newTags)
            saveField({ tags: newTags })
          }}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Assignee</label>
        <AssigneePicker
          value={
            deal.assignee_id
              ? { id: deal.assignee_id, type: (deal.assignee_type as 'human' | 'agent') ?? 'human' }
              : null
          }
          onChange={(actor) =>
            saveField({
              assignee_id: actor?.id ?? null,
              assignee_type: actor?.type ?? null,
            })
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Last enriched: {deal.last_enriched ? formatRelativeTime(deal.last_enriched) : 'Never'}
      </p>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Shelf Content — Company
// ---------------------------------------------------------------------------

export function CompanyShelfContent({
  company,
  onUpdate,
}: {
  company: CrmCompany
  onUpdate: (fields: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(company.name)
  const [domain, setDomain] = useState(company.domain ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [notes, setNotes] = useState(company.notes ?? '')
  const [tags, setTags] = useState<string[]>(company.tags)
  const [website, setWebsite] = useState(company.website ?? '')
  const [linkedin, setLinkedin] = useState(company.linkedin ?? '')
  const [twitter, setTwitter] = useState(company.twitter ?? '')
  const [instagram, setInstagram] = useState(company.instagram ?? '')
  const [companyLocation, setCompanyLocation] = useState(company.location ?? '')
  const [companySource, setCompanySource] = useState(company.source ?? '')

  useEffect(() => {
    setName(company.name)
    setDomain(company.domain ?? '')
    setIndustry(company.industry ?? '')
    setNotes(company.notes ?? '')
    setTags(company.tags)
    setWebsite(company.website ?? '')
    setLinkedin(company.linkedin ?? '')
    setTwitter(company.twitter ?? '')
    setInstagram(company.instagram ?? '')
    setCompanyLocation(company.location ?? '')
    setCompanySource(company.source ?? '')
  }, [company])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => saveField({ name: e.target.value })}
          className="text-base font-medium"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <UnfurlInput
          label="Domain"
          value={domain}
          onChange={(v) => setDomain(v)}
          onBlur={(v) => saveField({ domain: v || null })}
          placeholder="example.com"
        />
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Industry</label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            onBlur={(e) => saveField({ industry: e.target.value || null })}
            placeholder="e.g. Technology"
            className="text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Website</label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            onBlur={(e) => saveField({ website: e.target.value || null })}
            placeholder="https://example.com"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Location</label>
          <Input
            value={companyLocation}
            onChange={(e) => setCompanyLocation(e.target.value)}
            onBlur={(e) => saveField({ location: e.target.value || null })}
            placeholder="e.g. San Francisco, CA"
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Source</label>
        <Input
          value={companySource}
          onChange={(e) => setCompanySource(e.target.value)}
          onBlur={(e) => saveField({ source: e.target.value || null })}
          placeholder="e.g. referral, event, inbound"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">LinkedIn</label>
          <Input
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            onBlur={(e) => saveField({ linkedin: e.target.value || null })}
            placeholder="LinkedIn URL"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Twitter</label>
          <Input
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            onBlur={(e) => saveField({ twitter: e.target.value || null })}
            placeholder="@handle"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Instagram</label>
          <Input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            onBlur={(e) => saveField({ instagram: e.target.value || null })}
            placeholder="@handle"
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
        <RichTextEditor
          value={notes}
          onBlur={(md) => {
            setNotes(md)
            saveField({ notes: md || null })
          }}
          placeholder="Add notes..."
          minHeight="100px"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
        <TagCombobox
          selected={tags}
          onChange={(newTags) => {
            setTags(newTags)
            saveField({ tags: newTags })
          }}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Assignee</label>
        <AssigneePicker
          value={
            company.assignee_id
              ? { id: company.assignee_id, type: (company.assignee_type as 'human' | 'agent') ?? 'human' }
              : null
          }
          onChange={(actor) =>
            saveField({
              assignee_id: actor?.id ?? null,
              assignee_type: actor?.type ?? null,
            })
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Last enriched: {company.last_enriched ? formatRelativeTime(company.last_enriched) : 'Never'}
      </p>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Shelf Content — Person
// ---------------------------------------------------------------------------

export function PersonShelfContent({
  person,
  onUpdate,
}: {
  person: CrmPerson
  onUpdate: (fields: Record<string, unknown>) => void
}) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [personTitle, setPersonTitle] = useState(person.title ?? '')
  const [notes, setNotes] = useState(person.notes ?? '')
  const [tags, setTags] = useState<string[]>(person.tags)
  const [emails, setEmails] = useState<LabelValue[]>(person.emails ?? [])
  const [phones, setPhones] = useState<LabelValue[]>(person.phones ?? [])
  const [linkedin, setLinkedin] = useState(person.linkedin ?? '')
  const [twitter, setTwitter] = useState(person.twitter ?? '')
  const [instagram, setInstagram] = useState(person.instagram ?? '')
  const [personSource, setPersonSource] = useState(person.source ?? '')

  useEffect(() => {
    setName(person.name)
    setEmail(person.email ?? '')
    setPhone(person.phone ?? '')
    setPersonTitle(person.title ?? '')
    setNotes(person.notes ?? '')
    setTags(person.tags)
    setEmails(person.emails ?? [])
    setPhones(person.phones ?? [])
    setLinkedin(person.linkedin ?? '')
    setTwitter(person.twitter ?? '')
    setInstagram(person.instagram ?? '')
    setPersonSource(person.source ?? '')
  }, [person])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => saveField({ name: e.target.value })}
          className="text-base font-medium"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => saveField({ email: e.target.value || null })}
            placeholder="email@example.com"
            className="text-sm"
            type="email"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Phone</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={(e) => saveField({ phone: e.target.value || null })}
            placeholder="+1 234 567 890"
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
        <Input
          value={personTitle}
          onChange={(e) => setPersonTitle(e.target.value)}
          onBlur={(e) => saveField({ title: e.target.value || null })}
          placeholder="e.g. VP of Engineering"
          className="text-sm"
        />
      </div>

      <LabelValueListField
        label="Additional Emails"
        items={emails}
        onChange={(updated) => {
          setEmails(updated)
          saveField({ emails: updated })
        }}
        valuePlaceholder="email@example.com"
      />

      <LabelValueListField
        label="Additional Phones"
        items={phones}
        onChange={(updated) => {
          setPhones(updated)
          saveField({ phones: updated })
        }}
        valuePlaceholder="+1 234 567 890"
      />

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Source</label>
        <Input
          value={personSource}
          onChange={(e) => setPersonSource(e.target.value)}
          onBlur={(e) => saveField({ source: e.target.value || null })}
          placeholder="e.g. Overland Expo, cold outreach, referral"
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">LinkedIn</label>
          <Input
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            onBlur={(e) => saveField({ linkedin: e.target.value || null })}
            placeholder="LinkedIn URL"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Twitter</label>
          <Input
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            onBlur={(e) => saveField({ twitter: e.target.value || null })}
            placeholder="@handle"
            className="text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Instagram</label>
          <Input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            onBlur={(e) => saveField({ instagram: e.target.value || null })}
            placeholder="@handle"
            className="text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
        <RichTextEditor
          value={notes}
          onBlur={(md) => {
            setNotes(md)
            saveField({ notes: md || null })
          }}
          placeholder="Add notes..."
          minHeight="100px"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
        <TagCombobox
          selected={tags}
          onChange={(newTags) => {
            setTags(newTags)
            saveField({ tags: newTags })
          }}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground font-medium mb-1 block">Assignee</label>
        <AssigneePicker
          value={
            person.assignee_id
              ? { id: person.assignee_id, type: (person.assignee_type as 'human' | 'agent') ?? 'human' }
              : null
          }
          onChange={(actor) =>
            saveField({
              assignee_id: actor?.id ?? null,
              assignee_type: actor?.type ?? null,
            })
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Last enriched: {person.last_enriched ? formatRelativeTime(person.last_enriched) : 'Never'}
      </p>

    </div>
  )
}
