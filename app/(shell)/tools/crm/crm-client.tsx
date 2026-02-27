'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Plus, Trash2, User, Handshake, Link2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { EntityGrid } from '@/components/entity-client/entity-grid'
import { ViewToggle } from '@/components/entity-client/view-toggle'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { AssigneePicker } from '@/components/assignee-picker'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/rich-text-editor'
import { UnfurlInput } from '@/components/unfurl-input'
import { cn } from '@/lib/utils'
import { type BaseEntity, type EntityType } from '@/types/entities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrmCompany extends BaseEntity {
  name: string
  domain: string | null
  industry: string | null
  notes: string | null
}

interface CrmPerson extends BaseEntity {
  name: string
  email: string | null
  phone: string | null
  title: string | null
  notes: string | null
}

type DealStatus = 'prospect' | 'active' | 'won' | 'lost'

interface CrmDeal extends BaseEntity {
  title: string
  status: DealStatus
  value: number | null
  notes: string | null
}

type Section = 'deals' | 'companies' | 'people'
type View = 'grid' | 'table'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEAL_STATUS_CONFIG: Record<DealStatus, { label: string; className: string; funnelColor: string }> = {
  prospect: { label: 'Prospect', className: 'bg-slate-500/20 text-slate-400', funnelColor: 'bg-slate-500' },
  active:   { label: 'Active',   className: 'bg-blue-500/20 text-blue-400',   funnelColor: 'bg-blue-500' },
  won:      { label: 'Won',      className: 'bg-green-500/20 text-green-400', funnelColor: 'bg-green-500' },
  lost:     { label: 'Lost',     className: 'bg-red-500/20 text-red-400',     funnelColor: 'bg-red-500' },
}

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: 'deals', label: 'Deals' },
  { value: 'companies', label: 'Companies' },
  { value: 'people', label: 'People' },
]

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

  const createCompany = useCallback(async (name: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmCompany = {
      id: tempId, seq_id: null, tenant_id: '', name, domain: null, industry: null, notes: null,
      tags: [], assignee_id: null, assignee_type: null,
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
      setCompanies((prev) => prev.map((c) => (c.id === tempId ? (json.data as CrmCompany) : c)))
      toast({ type: 'success', message: 'Company created' })
    } catch (err) {
      setCompanies((prev) => prev.filter((c) => c.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create company' })
    }
  }, [])

  const createPerson = useCallback(async (name: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmPerson = {
      id: tempId, seq_id: null, tenant_id: '', name, email: null, phone: null, title: null, notes: null,
      tags: [], assignee_id: null, assignee_type: null,
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
      setPeople((prev) => prev.map((p) => (p.id === tempId ? (json.data as CrmPerson) : p)))
      toast({ type: 'success', message: 'Person created' })
    } catch (err) {
      setPeople((prev) => prev.filter((p) => p.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create person' })
    }
  }, [])

  const createDeal = useCallback(async (dealTitle: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: CrmDeal = {
      id: tempId, seq_id: null, tenant_id: '', title: dealTitle, status: 'prospect', value: null, notes: null,
      tags: [], assignee_id: null, assignee_type: null,
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
      setDeals((prev) => prev.map((d) => (d.id === tempId ? (json.data as CrmDeal) : d)))
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
    const tagSet = new Set<string>()
    for (const e of entities) {
      for (const t of e.tags ?? []) tagSet.add(t)
    }
    return Array.from(tagSet).sort()
  }, [section, deals, companies, people])

  // ----- Filtered entities per section -----

  const filteredDeals = useMemo(() => {
    let result = deals
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
    return result
  }, [deals, search, selectedTag])

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
    return result
  }, [companies, search, selectedTag])

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
    return result
  }, [people, search, selectedTag])

  const hasResults =
    section === 'deals'
      ? filteredDeals.length > 0
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
    window.history.pushState(null, '', `/tools/crm/${newSection}`)
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

      {/* Deal funnel (deals section only) */}
      {section === 'deals' && <DealFunnel deals={deals} />}

      {/* List view */}
      <div className="flex-1 overflow-y-auto">
        {!hasResults ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">No {entityLabelPlural} found</p>
          </div>
        ) : view === 'grid' ? (
          <EntityGrid>
            {section === 'deals' &&
              filteredDeals.map((d) => (
                <DealGridCard key={d.id} deal={d} onClick={() => openShelf(d)} />
              ))}
            {section === 'companies' &&
              filteredCompanies.map((c) => (
                <CompanyGridCard key={c.id} company={c} onClick={() => openShelf(c)} />
              ))}
            {section === 'people' &&
              filteredPeople.map((p) => (
                <PersonGridCard key={p.id} person={p} onClick={() => openShelf(p)} />
              ))}
          </EntityGrid>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {section === 'deals' && (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Value</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Created</th>
                    </>
                  )}
                  {section === 'companies' && (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Domain</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Industry</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Created</th>
                    </>
                  )}
                  {section === 'people' && (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Title</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tags</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {section === 'deals' &&
                  filteredDeals.map((d) => (
                    <DealTableRow key={d.id} deal={d} onClick={() => openShelf(d)} />
                  ))}
                {section === 'companies' &&
                  filteredCompanies.map((c) => (
                    <CompanyTableRow key={c.id} company={c} onClick={() => openShelf(c)} />
                  ))}
                {section === 'people' &&
                  filteredPeople.map((p) => (
                    <PersonTableRow key={p.id} person={p} onClick={() => openShelf(p)} />
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
              allCompanies={companies}
              allPeople={people}
            />
          )}
          {section === 'companies' && (
            <CompanyShelfContent
              company={selectedEntity as CrmCompany}
              onUpdate={(fields) => handleUpdate(selectedEntity.id, fields)}
              allPeople={people}
              allDeals={deals}
            />
          )}
          {section === 'people' && (
            <PersonShelfContent
              person={selectedEntity as CrmPerson}
              onUpdate={(fields) => handleUpdate(selectedEntity.id, fields)}
              allCompanies={companies}
              allDeals={deals}
            />
          )}
        </EntityShelf>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal Funnel Visualization
// ---------------------------------------------------------------------------

function DealFunnel({ deals }: { deals: CrmDeal[] }) {
  const stages: DealStatus[] = ['prospect', 'active', 'won', 'lost']

  const counts = useMemo(() => {
    const map: Record<DealStatus, number> = { prospect: 0, active: 0, won: 0, lost: 0 }
    for (const d of deals) {
      if (d.status in map) map[d.status]++
    }
    return map
  }, [deals])

  const total = deals.length
  if (total === 0) return null

  return (
    <div className="mb-4">
      <div className="flex h-8 rounded-md overflow-hidden">
        {stages.map((stage) => {
          const count = counts[stage]
          if (count === 0) return null
          const pct = (count / total) * 100
          const cfg = DEAL_STATUS_CONFIG[stage]
          return (
            <div
              key={stage}
              className={cn(
                'flex items-center justify-center text-xs font-medium text-white',
                cfg.funnelColor,
              )}
              style={{ width: `${pct}%`, minWidth: count > 0 ? '48px' : undefined }}
              title={`${cfg.label}: ${count}`}
            >
              {cfg.label} {count}
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
// Table Rows
// ---------------------------------------------------------------------------

function DealTableRow({ deal, onClick }: { deal: CrmDeal; onClick: () => void }) {
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

function CompanyTableRow({ company, onClick }: { company: CrmCompany; onClick: () => void }) {
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

function PersonTableRow({ person, onClick }: { person: CrmPerson; onClick: () => void }) {
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
// Shelf Content — Deal
// ---------------------------------------------------------------------------

function DealShelfContent({
  deal,
  onUpdate,
  allCompanies,
  allPeople,
}: {
  deal: CrmDeal
  onUpdate: (fields: Record<string, unknown>) => void
  allCompanies: CrmCompany[]
  allPeople: CrmPerson[]
}) {
  const [title, setTitle] = useState(deal.title)
  const [status, setStatus] = useState<DealStatus>(deal.status)
  const [value, setValue] = useState(deal.value != null ? String(deal.value) : '')
  const [notes, setNotes] = useState(deal.notes ?? '')
  const [tags, setTags] = useState<string[]>(deal.tags)

  const [linkedCompanyIds, setLinkedCompanyIds] = useState<string[]>([])
  const [linkedPeopleIds, setLinkedPeopleIds] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    setTitle(deal.title)
    setStatus(deal.status)
    setValue(deal.value != null ? String(deal.value) : '')
    setNotes(deal.notes ?? '')
    setTags(deal.tags)
  }, [deal])

  useEffect(() => {
    supabase
      .from('deals_companies')
      .select('company_id')
      .eq('deal_id', deal.id)
      .then(({ data }) => setLinkedCompanyIds((data ?? []).map((r) => r.company_id)))
    supabase
      .from('deals_people')
      .select('person_id')
      .eq('deal_id', deal.id)
      .then(({ data }) => setLinkedPeopleIds((data ?? []).map((r) => r.person_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  async function linkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => [...prev, companyId])
    const { error } = await supabase
      .from('deals_companies')
      .insert({ deal_id: deal.id, company_id: companyId })
    if (error) {
      setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
      toast({ type: 'error', message: 'Failed to link company' })
    }
  }

  async function unlinkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
    const { error } = await supabase
      .from('deals_companies')
      .delete()
      .eq('deal_id', deal.id)
      .eq('company_id', companyId)
    if (error) {
      setLinkedCompanyIds((prev) => [...prev, companyId])
      toast({ type: 'error', message: 'Failed to unlink company' })
    }
  }

  async function linkPerson(personId: string) {
    setLinkedPeopleIds((prev) => [...prev, personId])
    const { error } = await supabase
      .from('deals_people')
      .insert({ deal_id: deal.id, person_id: personId })
    if (error) {
      setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
      toast({ type: 'error', message: 'Failed to link person' })
    }
  }

  async function unlinkPerson(personId: string) {
    setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
    const { error } = await supabase
      .from('deals_people')
      .delete()
      .eq('deal_id', deal.id)
      .eq('person_id', personId)
    if (error) {
      setLinkedPeopleIds((prev) => [...prev, personId])
      toast({ type: 'error', message: 'Failed to unlink person' })
    }
  }

  const linkedCompanyItems = linkedCompanyIds
    .map((id) => allCompanies.find((c) => c.id === id))
    .filter((c): c is CrmCompany => c != null)
    .map((c) => ({ id: c.id, label: c.name }))

  const linkedPeopleItems = linkedPeopleIds
    .map((id) => allPeople.find((p) => p.id === id))
    .filter((p): p is CrmPerson => p != null)
    .map((p) => ({ id: p.id, label: p.name }))

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

      <LinkedSection
        title="Linked Companies"
        icon={<Building2 className="h-3 w-3" />}
        items={linkedCompanyItems}
        onUnlink={unlinkCompany}
        linkPicker={
          <LinkPicker
            items={allCompanies}
            linkedIds={new Set(linkedCompanyIds)}
            onLink={linkCompany}
            placeholder="Link Company"
          />
        }
      />

      <LinkedSection
        title="Linked People"
        icon={<User className="h-3 w-3" />}
        items={linkedPeopleItems}
        onUnlink={unlinkPerson}
        linkPicker={
          <LinkPicker
            items={allPeople}
            linkedIds={new Set(linkedPeopleIds)}
            onLink={linkPerson}
            placeholder="Link Person"
          />
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shelf Content — Company
// ---------------------------------------------------------------------------

function CompanyShelfContent({
  company,
  onUpdate,
  allPeople,
  allDeals,
}: {
  company: CrmCompany
  onUpdate: (fields: Record<string, unknown>) => void
  allPeople: CrmPerson[]
  allDeals: CrmDeal[]
}) {
  const [name, setName] = useState(company.name)
  const [domain, setDomain] = useState(company.domain ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [notes, setNotes] = useState(company.notes ?? '')
  const [tags, setTags] = useState<string[]>(company.tags)

  const [linkedPeopleIds, setLinkedPeopleIds] = useState<string[]>([])
  const [linkedDealIds, setLinkedDealIds] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    setName(company.name)
    setDomain(company.domain ?? '')
    setIndustry(company.industry ?? '')
    setNotes(company.notes ?? '')
    setTags(company.tags)
  }, [company])

  useEffect(() => {
    supabase
      .from('people_companies')
      .select('person_id')
      .eq('company_id', company.id)
      .then(({ data }) => setLinkedPeopleIds((data ?? []).map((r) => r.person_id)))
    supabase
      .from('deals_companies')
      .select('deal_id')
      .eq('company_id', company.id)
      .then(({ data }) => setLinkedDealIds((data ?? []).map((r) => r.deal_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  async function linkPerson(personId: string) {
    setLinkedPeopleIds((prev) => [...prev, personId])
    const { error } = await supabase
      .from('people_companies')
      .insert({ person_id: personId, company_id: company.id })
    if (error) {
      setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
      toast({ type: 'error', message: 'Failed to link person' })
    }
  }

  async function unlinkPerson(personId: string) {
    setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
    const { error } = await supabase
      .from('people_companies')
      .delete()
      .eq('person_id', personId)
      .eq('company_id', company.id)
    if (error) {
      setLinkedPeopleIds((prev) => [...prev, personId])
      toast({ type: 'error', message: 'Failed to unlink person' })
    }
  }

  async function linkDeal(dealId: string) {
    setLinkedDealIds((prev) => [...prev, dealId])
    const { error } = await supabase
      .from('deals_companies')
      .insert({ deal_id: dealId, company_id: company.id })
    if (error) {
      setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
      toast({ type: 'error', message: 'Failed to link deal' })
    }
  }

  async function unlinkDeal(dealId: string) {
    setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
    const { error } = await supabase
      .from('deals_companies')
      .delete()
      .eq('deal_id', dealId)
      .eq('company_id', company.id)
    if (error) {
      setLinkedDealIds((prev) => [...prev, dealId])
      toast({ type: 'error', message: 'Failed to unlink deal' })
    }
  }

  const linkedPeopleItems = linkedPeopleIds
    .map((id) => allPeople.find((p) => p.id === id))
    .filter((p): p is CrmPerson => p != null)
    .map((p) => ({ id: p.id, label: p.name }))

  const linkedDealItems = linkedDealIds
    .map((id) => allDeals.find((d) => d.id === id))
    .filter((d): d is CrmDeal => d != null)
    .map((d) => ({ id: d.id, label: d.title }))

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

      <LinkedSection
        title="Linked People"
        icon={<User className="h-3 w-3" />}
        items={linkedPeopleItems}
        onUnlink={unlinkPerson}
        linkPicker={
          <LinkPicker
            items={allPeople}
            linkedIds={new Set(linkedPeopleIds)}
            onLink={linkPerson}
            placeholder="Link Person"
          />
        }
      />

      <LinkedSection
        title="Linked Deals"
        icon={<Handshake className="h-3 w-3" />}
        items={linkedDealItems}
        onUnlink={unlinkDeal}
        linkPicker={
          <LinkPicker
            items={allDeals}
            linkedIds={new Set(linkedDealIds)}
            onLink={linkDeal}
            placeholder="Link Deal"
          />
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shelf Content — Person
// ---------------------------------------------------------------------------

function PersonShelfContent({
  person,
  onUpdate,
  allCompanies,
  allDeals,
}: {
  person: CrmPerson
  onUpdate: (fields: Record<string, unknown>) => void
  allCompanies: CrmCompany[]
  allDeals: CrmDeal[]
}) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [personTitle, setPersonTitle] = useState(person.title ?? '')
  const [notes, setNotes] = useState(person.notes ?? '')
  const [tags, setTags] = useState<string[]>(person.tags)

  const [linkedCompanyIds, setLinkedCompanyIds] = useState<string[]>([])
  const [linkedDealIds, setLinkedDealIds] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    setName(person.name)
    setEmail(person.email ?? '')
    setPhone(person.phone ?? '')
    setPersonTitle(person.title ?? '')
    setNotes(person.notes ?? '')
    setTags(person.tags)
  }, [person])

  useEffect(() => {
    supabase
      .from('people_companies')
      .select('company_id')
      .eq('person_id', person.id)
      .then(({ data }) => setLinkedCompanyIds((data ?? []).map((r) => r.company_id)))
    supabase
      .from('deals_people')
      .select('deal_id')
      .eq('person_id', person.id)
      .then(({ data }) => setLinkedDealIds((data ?? []).map((r) => r.deal_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id])

  function saveField(fields: Record<string, unknown>) {
    onUpdate(fields)
  }

  async function linkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => [...prev, companyId])
    const { error } = await supabase
      .from('people_companies')
      .insert({ person_id: person.id, company_id: companyId })
    if (error) {
      setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
      toast({ type: 'error', message: 'Failed to link company' })
    }
  }

  async function unlinkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
    const { error } = await supabase
      .from('people_companies')
      .delete()
      .eq('person_id', person.id)
      .eq('company_id', companyId)
    if (error) {
      setLinkedCompanyIds((prev) => [...prev, companyId])
      toast({ type: 'error', message: 'Failed to unlink company' })
    }
  }

  async function linkDeal(dealId: string) {
    setLinkedDealIds((prev) => [...prev, dealId])
    const { error } = await supabase
      .from('deals_people')
      .insert({ deal_id: dealId, person_id: person.id })
    if (error) {
      setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
      toast({ type: 'error', message: 'Failed to link deal' })
    }
  }

  async function unlinkDeal(dealId: string) {
    setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
    const { error } = await supabase
      .from('deals_people')
      .delete()
      .eq('deal_id', dealId)
      .eq('person_id', person.id)
    if (error) {
      setLinkedDealIds((prev) => [...prev, dealId])
      toast({ type: 'error', message: 'Failed to unlink deal' })
    }
  }

  const linkedCompanyItems = linkedCompanyIds
    .map((id) => allCompanies.find((c) => c.id === id))
    .filter((c): c is CrmCompany => c != null)
    .map((c) => ({ id: c.id, label: c.name }))

  const linkedDealItems = linkedDealIds
    .map((id) => allDeals.find((d) => d.id === id))
    .filter((d): d is CrmDeal => d != null)
    .map((d) => ({ id: d.id, label: d.title }))

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

      <LinkedSection
        title="Linked Companies"
        icon={<Building2 className="h-3 w-3" />}
        items={linkedCompanyItems}
        onUnlink={unlinkCompany}
        linkPicker={
          <LinkPicker
            items={allCompanies}
            linkedIds={new Set(linkedCompanyIds)}
            onLink={linkCompany}
            placeholder="Link Company"
          />
        }
      />

      <LinkedSection
        title="Linked Deals"
        icon={<Handshake className="h-3 w-3" />}
        items={linkedDealItems}
        onUnlink={unlinkDeal}
        linkPicker={
          <LinkPicker
            items={allDeals}
            linkedIds={new Set(linkedDealIds)}
            onLink={linkDeal}
            placeholder="Link Deal"
          />
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Link picker dropdown
// ---------------------------------------------------------------------------

function LinkPicker<T extends { id: string; name?: string | null; title?: string | null }>({
  items,
  linkedIds,
  onLink,
  placeholder,
}: {
  items: T[]
  linkedIds: Set<string>
  onLink: (id: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const available = items.filter(
    (item) => !linkedIds.has(item.id) && !item.id.startsWith('temp-'),
  )
  const filtered = available.filter((item) => {
    const label =
      ('name' in item && item.name ? item.name : 'title' in item && item.title ? item.title : '') ?? ''
    return label.toLowerCase().includes(query.toLowerCase())
  })

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} className="text-xs">
        <Link2 className="h-3 w-3 mr-1" />
        {placeholder}
      </Button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-md border border-border bg-card shadow-lg">
          <div className="p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="text-sm h-8"
              autoFocus
              onBlur={() => setTimeout(() => setOpen(false), 200)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No items available</p>
            ) : (
              filtered.map((item) => {
                const label =
                  ('name' in item && item.name
                    ? item.name
                    : 'title' in item && item.title
                      ? item.title
                      : '') ?? ''
                return (
                  <button
                    key={item.id}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                    onMouseDown={() => {
                      onLink(item.id)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    {label}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linked items section
// ---------------------------------------------------------------------------

function LinkedSection({
  title,
  icon,
  items,
  onUnlink,
  linkPicker,
}: {
  title: string
  icon: React.ReactNode
  items: Array<{ id: string; label: string }>
  onUnlink: (id: string) => void
  linkPicker: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
          {icon}
          {title}
        </label>
        {linkPicker}
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30 group"
            >
              <span className="text-sm truncate">{item.label}</span>
              <button
                onClick={() => onUnlink(item.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">None linked</p>
      )}
    </div>
  )
}
