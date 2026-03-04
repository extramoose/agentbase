'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled'
export type TaskType = 'bug' | 'improvement' | 'feature'
export type DashboardView = 'sticky-timeframe' | 'sticky-status' | 'experiment-a' | 'experiment-b'

export type WorkspaceMember = {
  id: string
  name: string
  avatarUrl: string | null
  role: 'human' | 'agent'
}

export type TaskFilters = {
  status: Status[]
  priority: Priority[]
  tags: string[]
}

// ---------------------------------------------------------------------------
// localStorage helpers (SSR-safe)
// ---------------------------------------------------------------------------

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* quota exceeded — ignore */ }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTaskFilters(workspaceId: string, currentUserId?: string) {
  // --- localStorage keys scoped to workspace ---
  const facePileKey = `ab:${workspaceId}:facePile`
  const filtersKey = `ab:${workspaceId}:filters`
  const dashboardViewKey = `ab:${workspaceId}:dashboardView`

  // --- Face pile (selected member IDs) ---
  const [facePile, setFacePileRaw] = useState<string[]>(
    currentUserId ? [currentUserId] : []
  )
  useEffect(() => {
    setFacePileRaw(lsGet<string[]>(facePileKey, currentUserId ? [currentUserId] : []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facePileKey])

  const setFacePile = useCallback(
    (ids: string[]) => {
      setFacePileRaw(ids)
      lsSet(facePileKey, ids)
    },
    [facePileKey],
  )

  const toggleFacePile = useCallback(
    (id: string) => {
      setFacePileRaw((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        lsSet(facePileKey, next)
        return next
      })
    },
    [facePileKey],
  )

  // --- Filters ---
  const [filters, setFiltersRaw] = useState<TaskFilters>({ status: [], priority: [], tags: [] })
  useEffect(() => {
    setFiltersRaw(lsGet<TaskFilters>(filtersKey, { status: [], priority: [], tags: [] }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  const setFilters = useCallback(
    (next: TaskFilters) => {
      setFiltersRaw(next)
      lsSet(filtersKey, next)
    },
    [filtersKey],
  )

  const updateFilter = useCallback(
    <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => {
      setFiltersRaw((prev) => {
        const next = { ...prev, [key]: value }
        lsSet(filtersKey, next)
        return next
      })
    },
    [filtersKey],
  )

  const clearFilters = useCallback(() => {
    const empty: TaskFilters = { status: [], priority: [], tags: [] }
    setFiltersRaw(empty)
    lsSet(filtersKey, empty)
  }, [filtersKey])

  const hasActiveFilters = useMemo(
    () =>
      filters.status.length > 0 ||
      filters.priority.length > 0 ||
      filters.tags.length > 0,
    [filters],
  )

  // --- Dashboard view (status | timeframe) ---
  // Initialize with fixed default to avoid SSR/client hydration mismatch.
  // Read from localStorage only after mount via useEffect.
  const [dashboardView, setDashboardViewRaw] = useState<DashboardView>('experiment-a')
  useEffect(() => {
    const stored = lsGet<DashboardView>(dashboardViewKey, 'experiment-a')
    setDashboardViewRaw(stored)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardViewKey])

  const setDashboardView = useCallback(
    (v: DashboardView) => {
      setDashboardViewRaw(v)
      lsSet(dashboardViewKey, v)
    },
    [dashboardViewKey],
  )

  // --- Workspace members ---
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])

  useEffect(() => {
    async function fetchMembers() {
      // Try sessionStorage cache first for instant render
      try {
        const cached = sessionStorage.getItem('workspace-members')
        if (cached) setWorkspaceMembers(JSON.parse(cached))
      } catch { /* ignore */ }

      try {
        const res = await fetch('/api/workspace/members')
        if (!res.ok) return
        const json = await res.json() as {
          success: boolean
          data: {
            agents: Array<{ id: string; name: string; avatar_url: string | null }>
            humans: Array<{ id: string; name: string; avatar_url: string | null }>
          }
        }
        if (!json.success) return
        const members: WorkspaceMember[] = [
          ...json.data.humans.map((h) => ({
            id: h.id,
            name: h.name,
            avatarUrl: h.avatar_url,
            role: 'human' as const,
          })),
          ...json.data.agents.map((a) => ({
            id: a.id,
            name: a.name,
            avatarUrl: a.avatar_url,
            role: 'agent' as const,
          })),
        ]
        setWorkspaceMembers(members)
        try {
          sessionStorage.setItem('workspace-members', JSON.stringify(members))
        } catch { /* ignore */ }
      } catch {
        // silently ignore — filter chips just won't show
      }
    }
    fetchMembers()
  }, [])

  // --- Available tags (from all tasks) ---
  const [availableTags, setAvailableTags] = useState<string[]>([])

  useEffect(() => {
    async function fetchTags() {
      try {
        const supabase = createClient()
        const { data } = await supabase.rpc('rpc_get_all_tags')
        if (Array.isArray(data)) {
          setAvailableTags(data.map((d: { tag: string }) => d.tag))
        }
      } catch { /* ignore */ }
    }
    fetchTags()
  }, [])

  // --- Filter application helper ---
  const applyFilters = useCallback(
    <T extends {
      status: string
      priority: string
      tags?: string[] | null
      assignee_id?: string | null
    }>(
      tasks: T[],
    ): T[] => {
      let result = tasks

      // Face pile: if any members selected, filter to those assignees
      if (facePile.length > 0) {
        result = result.filter((t) => t.assignee_id != null && facePile.includes(t.assignee_id))
      }

      // Status filter
      if (filters.status.length > 0) {
        result = result.filter((t) => filters.status.includes(t.status as Status))
      }

      // Priority filter
      if (filters.priority.length > 0) {
        result = result.filter((t) => filters.priority.includes(t.priority as Priority))
      }

      // Tags filter
      if (filters.tags.length > 0) {
        result = result.filter((t) =>
          filters.tags.some((tag) => (t.tags ?? []).includes(tag))
        )
      }

      return result
    },
    [facePile, filters],
  )

  return {
    // Face pile
    facePile,
    setFacePile,
    toggleFacePile,

    // Filters
    filters,
    setFilters,
    updateFilter,
    clearFilters,
    hasActiveFilters,

    // Dashboard view
    dashboardView,
    setDashboardView,

    // Workspace members
    workspaceMembers,

    // Available tags
    availableTags,

    // Utility
    applyFilters,
  }
}
