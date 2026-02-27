'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Plus, Trash2, User, Handshake, Link2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EditShelf } from '@/components/edit-shelf'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/rich-text-editor'
import { UnfurlInput } from '@/components/unfurl-input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Company = {
  id: string
  name: string
  domain: string | null
  industry: string | null
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

type Person = {
  id: string
  name: string
  email: string | null
  phone: string | null
  title: string | null
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

type DealStatus = 'prospect' | 'active' | 'won' | 'lost'

type Deal = {
  id: string
  title: string
  status: DealStatus
  value: number | null
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

type Tab = 'companies' | 'people' | 'deals'
type SortDir = 'asc' | 'desc'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEAL_STATUS_CONFIG: Record<DealStatus, { label: string; className: string }> = {
  prospect: { label: 'Prospect', className: 'bg-blue-500/20 text-blue-400' },
  active:   { label: 'Active',   className: 'bg-green-500/20 text-green-400' },
  won:      { label: 'Won',      className: 'bg-emerald-500/20 text-emerald-400' },
  lost:     { label: 'Lost',     className: 'bg-red-500/20 text-red-400' },
}

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'companies', label: 'Companies' },
  { value: 'people', label: 'People' },
  { value: 'deals', label: 'Deals' },
]

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function CrmClient({
  initialCompanies,
  initialPeople,
  initialDeals,
  initialSection,
  initialId,
}: {
  initialCompanies: Company[]
  initialPeople: Person[]
  initialDeals: Deal[]
  initialSection?: string
  initialId?: string
}) {
  const router = useRouter()
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router })
  const searchParams = useSearchParams()

  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [people, setPeople] = useState<Person[]>(initialPeople)
  const [deals, setDeals] = useState<Deal[]>(initialDeals)

  const validTabs: Tab[] = ['companies', 'people', 'deals']
  const resolvedTab = validTabs.includes(initialSection as Tab) ? (initialSection as Tab) : 'people'
  const [tab, setTab] = useState<Tab>(resolvedTab)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  const supabase = createClient()
  const initialHandled = useRef(false)

  // Build query string from current search state
  const buildQs = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [search])

  // Sync search state → URL query params (skip initial render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    routerRef.current.replace(`${window.location.pathname}${buildQs()}`, { scroll: false })
  }, [buildQs])

  // Open shelf for initialId after data is available
  useEffect(() => {
    if (!initialId || initialHandled.current) return
    const hasData = companies.length > 0 || people.length > 0 || deals.length > 0
    if (!hasData) return
    initialHandled.current = true

    if (tab === 'companies') {
      const entity = companies.find(c => c.id === initialId)
      if (entity) setSelectedCompany(entity)
    } else if (tab === 'people') {
      const entity = people.find(p => p.id === initialId)
      if (entity) setSelectedPerson(entity)
    } else {
      const entity = deals.find(d => d.id === initialId)
      if (entity) setSelectedDeal(entity)
    }
  }, [companies, people, deals, initialId, tab])

  // ----- Realtime subscriptions -----

  useEffect(() => {
    const companiesChannel = supabase
      .channel('companies:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'companies' }, (payload) => {
        const row = payload.new as Company
        setCompanies((prev) => prev.some((c) => c.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'companies' }, (payload) => {
        const row = payload.new as Company
        setCompanies((prev) => prev.map((c) => (c.id === row.id ? row : c)))
        setSelectedCompany((prev) => (prev?.id === row.id ? row : prev))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'companies' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setCompanies((prev) => prev.filter((c) => c.id !== id))
        setSelectedCompany((prev) => (prev?.id === id ? null : prev))
      })
      .subscribe()

    const peopleChannel = supabase
      .channel('people:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'people' }, (payload) => {
        const row = payload.new as Person
        setPeople((prev) => prev.some((p) => p.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people' }, (payload) => {
        const row = payload.new as Person
        setPeople((prev) => prev.map((p) => (p.id === row.id ? row : p)))
        setSelectedPerson((prev) => (prev?.id === row.id ? row : prev))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'people' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setPeople((prev) => prev.filter((p) => p.id !== id))
        setSelectedPerson((prev) => (prev?.id === id ? null : prev))
      })
      .subscribe()

    const dealsChannel = supabase
      .channel('deals:realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deals' }, (payload) => {
        const row = payload.new as Deal
        setDeals((prev) => prev.some((d) => d.id === row.id) ? prev : [...prev, row])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deals' }, (payload) => {
        const row = payload.new as Deal
        setDeals((prev) => prev.map((d) => (d.id === row.id ? row : d)))
        setSelectedDeal((prev) => (prev?.id === row.id ? row : prev))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'deals' }, (payload) => {
        const id = (payload.old as { id: string }).id
        setDeals((prev) => prev.filter((d) => d.id !== id))
        setSelectedDeal((prev) => (prev?.id === id ? null : prev))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(companiesChannel)
      supabase.removeChannel(peopleChannel)
      supabase.removeChannel(dealsChannel)
    }
  }, [])

  // ----- Update via command bus -----

  const updateEntity = useCallback(
    async (table: 'companies' | 'people' | 'deals', id: string, fields: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, id, fields }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
      }
    },
    []
  )

  // ----- Delete entity -----

  const deleteEntity = useCallback(
    async (table: 'companies' | 'people' | 'deals', id: string) => {
      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table, id }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        toast({ type: 'success', message: 'Deleted' })
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      }
    },
    []
  )

  // ----- Create entities -----

  const createCompany = useCallback(async (name: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Company = {
      id: tempId, name, domain: null, industry: null, notes: null, tags: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setCompanies((prev) => [optimistic, ...prev])

    try {
      const res = await fetch('/api/commands/create-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create company')
      setCompanies((prev) => prev.map((c) => (c.id === tempId ? (json.data as Company) : c)))
      toast({ type: 'success', message: 'Company created' })
    } catch (err) {
      setCompanies((prev) => prev.filter((c) => c.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create company' })
    }
  }, [])

  const createPerson = useCallback(async (name: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Person = {
      id: tempId, name, email: null, phone: null, title: null, notes: null, tags: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setPeople((prev) => [optimistic, ...prev])

    try {
      const res = await fetch('/api/commands/create-person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create person')
      setPeople((prev) => prev.map((p) => (p.id === tempId ? (json.data as Person) : p)))
      toast({ type: 'success', message: 'Person created' })
    } catch (err) {
      setPeople((prev) => prev.filter((p) => p.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create person' })
    }
  }, [])

  const createDeal = useCallback(async (title: string) => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Deal = {
      id: tempId, title, status: 'prospect', value: null, notes: null, tags: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setDeals((prev) => [optimistic, ...prev])

    try {
      const res = await fetch('/api/commands/create-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create deal')
      setDeals((prev) => prev.map((d) => (d.id === tempId ? (json.data as Deal) : d)))
      toast({ type: 'success', message: 'Deal created' })
    } catch (err) {
      setDeals((prev) => prev.filter((d) => d.id !== tempId))
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create deal' })
    }
  }, [])

  // ----- Sorting state -----

  const [companySortKey, setCompanySortKey] = useState<'name' | 'industry' | 'created_at'>('name')
  const [companySortDir, setCompanySortDir] = useState<SortDir>('asc')
  const [peopleSortKey, setPeopleSortKey] = useState<'name' | 'email' | 'title' | 'created_at'>('name')
  const [peopleSortDir, setPeopleSortDir] = useState<SortDir>('asc')
  const [dealsSortKey, setDealsSortKey] = useState<'title' | 'status' | 'value' | 'created_at'>('created_at')
  const [dealsSortDir, setDealsSortDir] = useState<SortDir>('desc')

  // ----- Filtered & sorted data -----

  const filteredCompanies = useMemo(() => {
    let result = companies
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.domain?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    result = [...result].sort((a, b) => {
      const av = a[companySortKey] ?? ''
      const bv = b[companySortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return companySortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [companies, search, companySortKey, companySortDir])

  const filteredPeople = useMemo(() => {
    let result = people
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.title?.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    result = [...result].sort((a, b) => {
      const av = a[peopleSortKey] ?? ''
      const bv = b[peopleSortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return peopleSortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [people, search, peopleSortKey, peopleSortDir])

  const filteredDeals = useMemo(() => {
    let result = deals
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((d) =>
        d.title.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    result = [...result].sort((a, b) => {
      if (dealsSortKey === 'value') {
        const av = a.value ?? 0
        const bv = b.value ?? 0
        return dealsSortDir === 'asc' ? av - bv : bv - av
      }
      const av = a[dealsSortKey] ?? ''
      const bv = b[dealsSortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv))
      return dealsSortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [deals, search, dealsSortKey, dealsSortDir])

  // ----- Add-new state -----

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) addInputRef.current?.focus()
  }, [adding])

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (tab === 'companies') createCompany(trimmed)
    else if (tab === 'people') createPerson(trimmed)
    else createDeal(trimmed)
    setNewName('')
    setAdding(false)
  }

  // Clear search when switching tabs
  useEffect(() => { setSearch('') }, [tab])

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold shrink-0">CRM</h1>
        <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end min-w-0">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder={`Search ${tab}...`}
            className="flex-1 max-w-lg"
          />
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Add {tab === 'companies' ? 'Company' : tab === 'people' ? 'Person' : 'Deal'}</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border pb-2 overflow-x-auto">
        {TABS.map((t) => {
          const count = t.value === 'companies' ? companies.length : t.value === 'people' ? people.length : deals.length
          return (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setAdding(false); router.replace('/tools/crm/' + t.value, { scroll: false }) }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                tab === t.value
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Quick add input */}
      {adding && (
        <div className="flex items-center gap-2 mb-4">
          <Input
            ref={addInputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setNewName('') }
            }}
            placeholder={tab === 'companies' ? 'Company name' : tab === 'people' ? 'Person name' : 'Deal title'}
            className="flex-1 max-w-md"
          />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName('') }}>Cancel</Button>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'companies' && (
          <CompaniesTable
            companies={filteredCompanies}
            sortKey={companySortKey}
            sortDir={companySortDir}
            onSort={(key, dir) => { setCompanySortKey(key); setCompanySortDir(dir) }}
            onSelect={(c) => { setSelectedCompany(c); router.replace(`/tools/crm/companies/${c.id}${buildQs()}`, { scroll: false }) }}
          />
        )}
        {tab === 'people' && (
          <PeopleTable
            people={filteredPeople}
            sortKey={peopleSortKey}
            sortDir={peopleSortDir}
            onSort={(key, dir) => { setPeopleSortKey(key); setPeopleSortDir(dir) }}
            onSelect={(p) => { setSelectedPerson(p); router.replace(`/tools/crm/people/${p.id}${buildQs()}`, { scroll: false }) }}
          />
        )}
        {tab === 'deals' && (
          <DealsTable
            deals={filteredDeals}
            sortKey={dealsSortKey}
            sortDir={dealsSortDir}
            onSort={(key, dir) => { setDealsSortKey(key); setDealsSortDir(dir) }}
            onSelect={(d) => { setSelectedDeal(d); router.replace(`/tools/crm/deals/${d.id}${buildQs()}`, { scroll: false }) }}
          />
        )}
      </div>

      {/* Edit shelves */}
      {selectedCompany && (
        <CompanyEditShelf
          company={selectedCompany}
          allPeople={people}
          allDeals={deals}
          onClose={() => { setSelectedCompany(null); router.replace(`/tools/crm/companies${buildQs()}`, { scroll: false }) }}
          onUpdate={(id, fields) => {
            setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields, updated_at: new Date().toISOString() } as Company : c)))
            setSelectedCompany((prev) => (prev?.id === id ? { ...prev, ...fields, updated_at: new Date().toISOString() } as Company : prev))
            updateEntity('companies', id, fields)
          }}
          onDelete={(id) => {
            setSelectedCompany(null)
            setCompanies((prev) => prev.filter((c) => c.id !== id))
            deleteEntity('companies', id)
            router.replace(`/tools/crm/companies${buildQs()}`, { scroll: false })
          }}
        />
      )}
      {selectedPerson && (
        <PersonEditShelf
          person={selectedPerson}
          allCompanies={companies}
          allDeals={deals}
          onClose={() => { setSelectedPerson(null); router.replace(`/tools/crm/people${buildQs()}`, { scroll: false }) }}
          onUpdate={(id, fields) => {
            setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...fields, updated_at: new Date().toISOString() } as Person : p)))
            setSelectedPerson((prev) => (prev?.id === id ? { ...prev, ...fields, updated_at: new Date().toISOString() } as Person : prev))
            updateEntity('people', id, fields)
          }}
          onDelete={(id) => {
            setSelectedPerson(null)
            setPeople((prev) => prev.filter((p) => p.id !== id))
            deleteEntity('people', id)
            router.replace(`/tools/crm/people${buildQs()}`, { scroll: false })
          }}
        />
      )}
      {selectedDeal && (
        <DealEditShelf
          deal={selectedDeal}
          allCompanies={companies}
          allPeople={people}
          onClose={() => { setSelectedDeal(null); router.replace(`/tools/crm/deals${buildQs()}`, { scroll: false }) }}
          onUpdate={(id, fields) => {
            setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...fields, updated_at: new Date().toISOString() } as Deal : d)))
            setSelectedDeal((prev) => (prev?.id === id ? { ...prev, ...fields, updated_at: new Date().toISOString() } as Deal : prev))
            updateEntity('deals', id, fields)
          }}
          onDelete={(id) => {
            setSelectedDeal(null)
            setDeals((prev) => prev.filter((d) => d.id !== id))
            deleteEntity('deals', id)
            router.replace(`/tools/crm/deals${buildQs()}`, { scroll: false })
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Companies table
// ---------------------------------------------------------------------------

function CompaniesTable({
  companies,
  sortKey,
  sortDir,
  onSort,
  onSelect,
}: {
  companies: Company[]
  sortKey: string
  sortDir: SortDir
  onSort: (key: 'name' | 'industry' | 'created_at', dir: SortDir) => void
  onSelect: (c: Company) => void
}) {
  if (companies.length === 0) {
    return <EmptyState label="companies" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        {/* Header */}
        <div className="grid grid-cols-[1fr_150px_150px_100px] gap-3 px-3 py-2 border-b border-border">
          <SortableHeader label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Industry" sortKey="industry" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Created" sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
        </div>
        {/* Rows */}
        {companies.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c)}
            className="grid grid-cols-[1fr_150px_150px_100px] gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{c.name}</span>
              {c.domain && <span className="text-xs text-muted-foreground truncate">{c.domain}</span>}
            </div>
            <span className="text-sm text-muted-foreground truncate">{c.industry ?? '\u2014'}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <div className="flex gap-1 overflow-hidden">
              {c.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 shrink-0">{tag}</Badge>
              ))}
              {c.tags.length > 2 && <span className="text-xs text-muted-foreground">+{c.tags.length - 2}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// People table
// ---------------------------------------------------------------------------

function PeopleTable({
  people,
  sortKey,
  sortDir,
  onSort,
  onSelect,
}: {
  people: Person[]
  sortKey: string
  sortDir: SortDir
  onSort: (key: 'name' | 'email' | 'title' | 'created_at', dir: SortDir) => void
  onSelect: (p: Person) => void
}) {
  if (people.length === 0) {
    return <EmptyState label="people" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="grid grid-cols-[1fr_1fr_150px_100px] gap-3 px-3 py-2 border-b border-border">
          <SortableHeader label="Name" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Email" sortKey="email" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Title" sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
        </div>
        {people.map((p) => (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            className="grid grid-cols-[1fr_1fr_150px_100px] gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{p.name}</span>
            </div>
            <span className="text-sm text-muted-foreground truncate">{p.email ?? '\u2014'}</span>
            <span className="text-sm text-muted-foreground truncate">{p.title ?? '\u2014'}</span>
            <div className="flex gap-1 overflow-hidden">
              {p.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 shrink-0">{tag}</Badge>
              ))}
              {p.tags.length > 2 && <span className="text-xs text-muted-foreground">+{p.tags.length - 2}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deals table
// ---------------------------------------------------------------------------

function DealsTable({
  deals,
  sortKey,
  sortDir,
  onSort,
  onSelect,
}: {
  deals: Deal[]
  sortKey: string
  sortDir: SortDir
  onSort: (key: 'title' | 'status' | 'value' | 'created_at', dir: SortDir) => void
  onSelect: (d: Deal) => void
}) {
  if (deals.length === 0) {
    return <EmptyState label="deals" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div className="grid grid-cols-[1fr_100px_120px_100px] gap-3 px-3 py-2 border-b border-border">
          <SortableHeader label="Title" sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Status" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Value" sortKey="value" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableHeader label="Created" sortKey="created_at" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
        </div>
        {deals.map((d) => {
          const statusCfg = DEAL_STATUS_CONFIG[d.status]
          return (
            <div
              key={d.id}
              onClick={() => onSelect(d)}
              className="grid grid-cols-[1fr_100px_120px_100px] gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer border-b border-border/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Handshake className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{d.title}</span>
              </div>
              <Badge variant="secondary" className={cn('text-xs w-fit', statusCfg.className)}>
                {statusCfg.label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {d.value != null ? `$${Number(d.value).toLocaleString()}` : '\u2014'}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sortable header (shared)
// ---------------------------------------------------------------------------

function SortableHeader<K extends string>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
}: {
  label: string
  sortKey: K
  currentKey: string
  currentDir: SortDir
  onSort: (key: K, dir: SortDir) => void
}) {
  const active = currentKey === sortKey
  return (
    <button
      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors text-left"
      onClick={() => onSort(sortKey, active && currentDir === 'asc' ? 'desc' : 'asc')}
    >
      {label}
      {active && <span className="ml-1">{currentDir === 'asc' ? '\u2191' : '\u2193'}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <p className="text-sm">No {label} found</p>
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
    (item) => !linkedIds.has(item.id) && !item.id.startsWith('temp-')
  )
  const filtered = available.filter((item) => {
    const label = ('name' in item ? item.name : 'title' in item ? item.title : '') ?? ''
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
                const label = ('name' in item ? item.name : 'title' in item ? item.title : '') ?? ''
                return (
                  <button
                    key={item.id}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                    onMouseDown={() => { onLink(item.id); setOpen(false); setQuery('') }}
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

// ---------------------------------------------------------------------------
// Company EditShelf
// ---------------------------------------------------------------------------

function CompanyEditShelf({
  company,
  allPeople,
  allDeals,
  onClose,
  onUpdate,
  onDelete,
}: {
  company: Company
  allPeople: Person[]
  allDeals: Deal[]
  onClose: () => void
  onUpdate: (id: string, fields: Record<string, unknown>) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(company.name)
  const [domain, setDomain] = useState(company.domain ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [notes, setNotes] = useState(company.notes ?? '')
  const [tags, setTags] = useState<string[]>(company.tags)

  const [linkedPeopleIds, setLinkedPeopleIds] = useState<string[]>([])
  const [linkedDealIds, setLinkedDealIds] = useState<string[]>([])

  const supabase = createClient()

  // Sync from prop
  useEffect(() => {
    setName(company.name)
    setDomain(company.domain ?? '')
    setIndustry(company.industry ?? '')
    setNotes(company.notes ?? '')
    setTags(company.tags)
  }, [company])

  // Fetch linked people and deals
  useEffect(() => {
    supabase.from('people_companies').select('person_id').eq('company_id', company.id)
      .then(({ data }) => setLinkedPeopleIds((data ?? []).map((r) => r.person_id)))
    supabase.from('deals_companies').select('deal_id').eq('company_id', company.id)
      .then(({ data }) => setLinkedDealIds((data ?? []).map((r) => r.deal_id)))
  }, [company.id])

  function saveFieldImmediate(fields: Record<string, unknown>) {
    onUpdate(company.id, fields)
  }

  async function linkPerson(personId: string) {
    setLinkedPeopleIds((prev) => [...prev, personId])
    const { error } = await supabase.from('people_companies').insert({ person_id: personId, company_id: company.id })
    if (error) {
      setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
      toast({ type: 'error', message: 'Failed to link person' })
    }
  }

  async function unlinkPerson(personId: string) {
    setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
    const { error } = await supabase.from('people_companies').delete().eq('person_id', personId).eq('company_id', company.id)
    if (error) {
      setLinkedPeopleIds((prev) => [...prev, personId])
      toast({ type: 'error', message: 'Failed to unlink person' })
    }
  }

  async function linkDeal(dealId: string) {
    setLinkedDealIds((prev) => [...prev, dealId])
    const { error } = await supabase.from('deals_companies').insert({ deal_id: dealId, company_id: company.id })
    if (error) {
      setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
      toast({ type: 'error', message: 'Failed to link deal' })
    }
  }

  async function unlinkDeal(dealId: string) {
    setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
    const { error } = await supabase.from('deals_companies').delete().eq('deal_id', dealId).eq('company_id', company.id)
    if (error) {
      setLinkedDealIds((prev) => [...prev, dealId])
      toast({ type: 'error', message: 'Failed to unlink deal' })
    }
  }

  const linkedPeopleItems = linkedPeopleIds
    .map((id) => allPeople.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ id: p!.id, label: p!.name }))

  const linkedDealItems = linkedDealIds
    .map((id) => allDeals.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({ id: d!.id, label: d!.title }))

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title={company.name}
      entityType="companies"
      entityId={company.id}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(company.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => saveFieldImmediate({ name: e.target.value })}
            className="text-base font-medium"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <UnfurlInput
            label="Domain"
            value={domain}
            onChange={(v) => setDomain(v)}
            onBlur={(v) => saveFieldImmediate({ domain: v || null })}
            placeholder="example.com"
          />
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Industry</label>
            <Input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ industry: e.target.value || null })}
              placeholder="e.g. Technology"
              className="text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
          <RichTextEditor
            value={notes}
            onBlur={(md) => { setNotes(md); saveFieldImmediate({ notes: md || null }) }}
            placeholder="Add notes..."
            minHeight="100px"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
          <TagCombobox
            selected={tags}
            onChange={(newTags) => { setTags(newTags); saveFieldImmediate({ tags: newTags }) }}
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
    </EditShelf>
  )
}

// ---------------------------------------------------------------------------
// Person EditShelf
// ---------------------------------------------------------------------------

function PersonEditShelf({
  person,
  allCompanies,
  allDeals,
  onClose,
  onUpdate,
  onDelete,
}: {
  person: Person
  allCompanies: Company[]
  allDeals: Deal[]
  onClose: () => void
  onUpdate: (id: string, fields: Record<string, unknown>) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [title, setTitle] = useState(person.title ?? '')
  const [notes, setNotes] = useState(person.notes ?? '')
  const [tags, setTags] = useState<string[]>(person.tags)

  const [linkedCompanyIds, setLinkedCompanyIds] = useState<string[]>([])
  const [linkedDealIds, setLinkedDealIds] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    setName(person.name)
    setEmail(person.email ?? '')
    setPhone(person.phone ?? '')
    setTitle(person.title ?? '')
    setNotes(person.notes ?? '')
    setTags(person.tags)
  }, [person])

  useEffect(() => {
    supabase.from('people_companies').select('company_id').eq('person_id', person.id)
      .then(({ data }) => setLinkedCompanyIds((data ?? []).map((r) => r.company_id)))
    supabase.from('deals_people').select('deal_id').eq('person_id', person.id)
      .then(({ data }) => setLinkedDealIds((data ?? []).map((r) => r.deal_id)))
  }, [person.id])

  function saveFieldImmediate(fields: Record<string, unknown>) {
    onUpdate(person.id, fields)
  }

  async function linkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => [...prev, companyId])
    const { error } = await supabase.from('people_companies').insert({ person_id: person.id, company_id: companyId })
    if (error) {
      setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
      toast({ type: 'error', message: 'Failed to link company' })
    }
  }

  async function unlinkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
    const { error } = await supabase.from('people_companies').delete().eq('person_id', person.id).eq('company_id', companyId)
    if (error) {
      setLinkedCompanyIds((prev) => [...prev, companyId])
      toast({ type: 'error', message: 'Failed to unlink company' })
    }
  }

  async function linkDeal(dealId: string) {
    setLinkedDealIds((prev) => [...prev, dealId])
    const { error } = await supabase.from('deals_people').insert({ deal_id: dealId, person_id: person.id })
    if (error) {
      setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
      toast({ type: 'error', message: 'Failed to link deal' })
    }
  }

  async function unlinkDeal(dealId: string) {
    setLinkedDealIds((prev) => prev.filter((id) => id !== dealId))
    const { error } = await supabase.from('deals_people').delete().eq('deal_id', dealId).eq('person_id', person.id)
    if (error) {
      setLinkedDealIds((prev) => [...prev, dealId])
      toast({ type: 'error', message: 'Failed to unlink deal' })
    }
  }

  const linkedCompanyItems = linkedCompanyIds
    .map((id) => allCompanies.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ id: c!.id, label: c!.name }))

  const linkedDealItems = linkedDealIds
    .map((id) => allDeals.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({ id: d!.id, label: d!.title }))

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title={person.name}
      entityType="people"
      entityId={person.id}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(person.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => saveFieldImmediate({ name: e.target.value })}
            className="text-base font-medium"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ email: e.target.value || null })}
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
              onBlur={(e) => saveFieldImmediate({ phone: e.target.value || null })}
              placeholder="+1 234 567 890"
              className="text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveFieldImmediate({ title: e.target.value || null })}
            placeholder="e.g. VP of Engineering"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Notes</label>
          <RichTextEditor
            value={notes}
            onBlur={(md) => { setNotes(md); saveFieldImmediate({ notes: md || null }) }}
            placeholder="Add notes..."
            minHeight="100px"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
          <TagCombobox
            selected={tags}
            onChange={(newTags) => { setTags(newTags); saveFieldImmediate({ tags: newTags }) }}
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
    </EditShelf>
  )
}

// ---------------------------------------------------------------------------
// Deal EditShelf
// ---------------------------------------------------------------------------

function DealEditShelf({
  deal,
  allCompanies,
  allPeople,
  onClose,
  onUpdate,
  onDelete,
}: {
  deal: Deal
  allCompanies: Company[]
  allPeople: Person[]
  onClose: () => void
  onUpdate: (id: string, fields: Record<string, unknown>) => void
  onDelete: (id: string) => void
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
    supabase.from('deals_companies').select('company_id').eq('deal_id', deal.id)
      .then(({ data }) => setLinkedCompanyIds((data ?? []).map((r) => r.company_id)))
    supabase.from('deals_people').select('person_id').eq('deal_id', deal.id)
      .then(({ data }) => setLinkedPeopleIds((data ?? []).map((r) => r.person_id)))
  }, [deal.id])

  function saveFieldImmediate(fields: Record<string, unknown>) {
    onUpdate(deal.id, fields)
  }

  async function linkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => [...prev, companyId])
    const { error } = await supabase.from('deals_companies').insert({ deal_id: deal.id, company_id: companyId })
    if (error) {
      setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
      toast({ type: 'error', message: 'Failed to link company' })
    }
  }

  async function unlinkCompany(companyId: string) {
    setLinkedCompanyIds((prev) => prev.filter((id) => id !== companyId))
    const { error } = await supabase.from('deals_companies').delete().eq('deal_id', deal.id).eq('company_id', companyId)
    if (error) {
      setLinkedCompanyIds((prev) => [...prev, companyId])
      toast({ type: 'error', message: 'Failed to unlink company' })
    }
  }

  async function linkPerson(personId: string) {
    setLinkedPeopleIds((prev) => [...prev, personId])
    const { error } = await supabase.from('deals_people').insert({ deal_id: deal.id, person_id: personId })
    if (error) {
      setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
      toast({ type: 'error', message: 'Failed to link person' })
    }
  }

  async function unlinkPerson(personId: string) {
    setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
    const { error } = await supabase.from('deals_people').delete().eq('deal_id', deal.id).eq('person_id', personId)
    if (error) {
      setLinkedPeopleIds((prev) => [...prev, personId])
      toast({ type: 'error', message: 'Failed to unlink person' })
    }
  }

  const linkedCompanyItems = linkedCompanyIds
    .map((id) => allCompanies.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ id: c!.id, label: c!.name }))

  const linkedPeopleItems = linkedPeopleIds
    .map((id) => allPeople.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ id: p!.id, label: p!.name }))

  return (
    <EditShelf
      isOpen
      onClose={onClose}
      title={deal.title}
      entityType="deals"
      entityId={deal.id}
      headerRight={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(deal.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => saveFieldImmediate({ title: e.target.value })}
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
                saveFieldImmediate({ status: val })
              }}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            >
              {(Object.keys(DEAL_STATUS_CONFIG) as DealStatus[]).map((s) => (
                <option key={s} value={s}>{DEAL_STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Value</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={(e) => {
                  const v = e.target.value
                  const num = v ? parseFloat(v) : null
                  if (v === '' || (num !== null && !isNaN(num))) {
                    saveFieldImmediate({ value: num })
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
            onBlur={(md) => { setNotes(md); saveFieldImmediate({ notes: md || null }) }}
            placeholder="Add notes..."
            minHeight="100px"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium mb-1 block">Tags</label>
          <TagCombobox
            selected={tags}
            onChange={(newTags) => { setTags(newTags); saveFieldImmediate({ tags: newTags }) }}
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
    </EditShelf>
  )
}
