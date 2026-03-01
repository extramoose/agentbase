'use client'

import { useState, useEffect, useRef } from 'react'

export type EntitySearchResult = {
  id: string
  type: 'tasks' | 'people' | 'companies' | 'deals' | 'library_items'
  name: string
  subtitle?: string
  seq_id?: number
}

const SEARCH_TYPE_TO_TABLE: Record<string, string> = {
  tasks: 'tasks',
  people: 'people',
  companies: 'companies',
  deals: 'deals',
  library: 'library_items',
}

function extractName(searchType: string, row: Record<string, unknown>): string {
  if (searchType === 'tasks') return (row.title as string) ?? 'Untitled'
  if (searchType === 'library') return (row.title as string) ?? 'Untitled'
  return (row.name as string) ?? (row.title as string) ?? 'Untitled'
}

function extractSubtitle(searchType: string, row: Record<string, unknown>): string | undefined {
  if (searchType === 'tasks' && row.ticket_id != null) return `Task #${row.ticket_id}`
  return undefined
}

export function useEntitySearch(query: string) {
  const [results, setResults] = useState<EntitySearchResult[]>([])
  const [recentResults, setRecentResults] = useState<EntitySearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Fetch recent entities once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/entities/recent')
        if (!res.ok) return
        const json = await res.json()
        const rows = json.data as { id: string; label: string; entity_type: string }[]
        if (cancelled || !Array.isArray(rows)) return
        setRecentResults(
          rows.map(r => ({
            id: r.id,
            type: r.entity_type as EntitySearchResult['type'],
            name: r.label,
          }))
        )
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`)
        if (!res.ok) { setLoading(false); return }
        const json = await res.json()
        const data = json.data as Record<string, Record<string, unknown>[]> | undefined

        const flat: EntitySearchResult[] = []
        if (data && typeof data === 'object') {
          for (const [searchType, rows] of Object.entries(data)) {
            if (!Array.isArray(rows)) continue
            const tableName = SEARCH_TYPE_TO_TABLE[searchType] ?? searchType
            for (const row of rows) {
              const id = row.id as string
              if (!id) continue
              flat.push({
                id,
                type: tableName as EntitySearchResult['type'],
                name: extractName(searchType, row),
                subtitle: extractSubtitle(searchType, row),
                seq_id: typeof row.seq_id === 'number' ? row.seq_id
                  : typeof row.ticket_id === 'number' ? row.ticket_id
                  : undefined,
              })
            }
          }
        }

        setResults(flat)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  return { results, loading, recentResults }
}
