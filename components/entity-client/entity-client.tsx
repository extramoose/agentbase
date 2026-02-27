'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { EntityShelf } from './entity-shelf'
import { EntityGrid } from './entity-grid'
import { type EntityTableColumn } from './entity-table'
import { ViewToggle } from './view-toggle'
import {
  type BaseEntity,
  type EntityClientProps,
  ENTITY_TABLE,
} from '@/types/entities'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type View = 'grid' | 'table'

function readParam(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

// ---------------------------------------------------------------------------
// EntityClient
// ---------------------------------------------------------------------------

export function EntityClient<T extends BaseEntity>({
  initialEntities,
  initialSelectedId,
  entityType,
  entityLabel: _entityLabel,
  entityLabelPlural,
  renderGridCard,
  renderTableRow: _renderTableRow,
  renderShelfContent,
  renderFilterChips,
}: Omit<EntityClientProps<T>, 'onCreateEntity'> & {
  /** Optional table columns for built-in table mode */
  tableColumns?: EntityTableColumn<T>[]
  /** Called when an entity is updated inside the shelf */
  onEntityChange?: (updated: T) => void
}) {
  // ----- Local state -----
  const [entities, setEntities] = useState<T[]>(initialEntities)
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSelectedId ?? null,
  )
  const [view, setView] = useState<View>('table')
  const [search, setSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const supabase = createClient()
  const tableName = ENTITY_TABLE[entityType]

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

  // ----- Derive selected entity -----
  const selectedEntity = useMemo(
    () =>
      selectedId !== null
        ? entities.find((e) => e.seq_id === selectedId) ?? null
        : null,
    [entities, selectedId],
  )

  // ----- Collect all tags from entities -----
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const e of entities) {
      for (const t of e.tags ?? []) tagSet.add(t)
    }
    return Array.from(tagSet).sort()
  }, [entities])

  // ----- Filter entities -----
  const filteredEntities = useMemo(() => {
    let result = entities

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((e) => {
        const title =
          (e as Record<string, unknown>)['title'] ??
          (e as Record<string, unknown>)['name'] ??
          ''
        return (
          String(title).toLowerCase().includes(q) ||
          (e.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
        )
      })
    }

    // Tag filter
    if (selectedTag) {
      result = result.filter((e) => (e.tags ?? []).includes(selectedTag))
    }

    return result
  }, [entities, search, selectedTag])

  // ----- URL sync for filters (replaceState — no new history entry) -----
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const params = new URLSearchParams(window.location.search)
    // Preserve ?id= if shelf is open
    if (selectedId !== null) {
      params.set('id', String(selectedId))
    } else {
      params.delete('id')
    }
    if (search) params.set('q', search)
    else params.delete('q')
    if (selectedTag) params.set('tag', selectedTag)
    else params.delete('tag')
    // Preserve ?view= — managed by ViewToggle
    const qs = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}`,
    )
  }, [search, selectedTag, selectedId])

  // ----- Shelf open / close with pushState -----

  const openShelf = useCallback((entity: T) => {
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

  // popstate listener — browser back/forward
  useEffect(() => {
    const handler = () => {
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

  // ----- Real-time Supabase subscription -----

  useEffect(() => {
    const channel = supabase
      .channel(`${entityType}:realtime`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName },
        (payload) => {
          const newEntity = payload.new as T
          setEntities((prev) => {
            if (prev.some((e) => e.id === newEntity.id)) return prev
            return [...prev, newEntity]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: tableName },
        (payload) => {
          const updated = payload.new as T
          setEntities((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: tableName },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setEntities((prev) => prev.filter((e) => e.id !== deletedId))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, tableName])

  // ----- Entity change handler (used inside shelf) -----

  const handleEntityChange = useCallback((updated: T) => {
    setEntities((prev) =>
      prev.map((e) => (e.id === updated.id ? updated : e)),
    )
  }, [])

  // ----- Tag change handler -----

  const handleTagChange = useCallback((tag: string | null) => {
    setSelectedTag(tag)
  }, [])

  // ----- Render -----

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: search + filters + view toggle */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <SearchFilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder={`Search ${entityLabelPlural}...`}
          tags={allTags}
          selectedTag={selectedTag}
          onTagChange={handleTagChange}
        >
          {renderFilterChips?.()}
        </SearchFilterBar>
        <ViewToggle onChange={setView} />
      </div>

      {/* List view */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">
              No {entityLabelPlural} found
            </p>
          </div>
        ) : view === 'grid' ? (
          <EntityGrid>
            {filteredEntities.map((entity) =>
              renderGridCard(entity, () => openShelf(entity)),
            )}
          </EntityGrid>
        ) : (
          /* Table view — delegate to renderTableRow for full row control */
          <div className="space-y-0">
            {filteredEntities.map((entity) =>
              _renderTableRow(entity, () => openShelf(entity)),
            )}
          </div>
        )}
      </div>

      {/* Shelf */}
      {selectedEntity && (
        <EntityShelf
          entity={selectedEntity}
          entityType={entityType}
          onClose={closeShelf}
        >
          {renderShelfContent(selectedEntity, handleEntityChange)}
        </EntityShelf>
      )}
    </div>
  )
}
