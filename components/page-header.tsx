'use client'

import { useCallback, useState } from 'react'
import {
  Plus,
  Filter,
  X,
  Calendar,
  BarChart3,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TagCombobox } from '@/components/tag-combobox'
import { AssigneePicker } from '@/components/assignee-picker'
import { cn } from '@/lib/utils'
import type {
  DashboardView,
  Priority,
  Status,
  TaskFilters,
  WorkspaceMember,
} from '@/hooks/use-task-filters'

// ---------------------------------------------------------------------------
// Config (shared labels)
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  /** Page title shown top-left */
  title: string

  /** Face pile members */
  workspaceMembers: WorkspaceMember[]
  /** Currently selected member IDs for face pile */
  facePile: string[]
  /** Toggle a member in/out of the face pile */
  onToggleFacePile: (id: string) => void

  /** Optional view toggle (Dashboard only) */
  showViewToggle?: boolean
  dashboardView?: DashboardView
  onDashboardViewChange?: (view: DashboardView) => void

  /** Filter state */
  filters: TaskFilters
  onFiltersChange: (filters: TaskFilters) => void
  hasActiveFilters: boolean
  onClearFilters: () => void

  /** New Task button */
  onNewTask: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  workspaceMembers,
  facePile,
  onToggleFacePile,
  showViewToggle = false,
  dashboardView,
  onDashboardViewChange,
  filters,
  onFiltersChange,
  hasActiveFilters,
  onClearFilters,
  onNewTask,
}: PageHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)

  // --- Pill helpers ---
  const pills: { key: string; label: string; onRemove: () => void }[] = []

  for (const s of filters.status) {
    const opt = STATUS_OPTIONS.find((o) => o.value === s)
    pills.push({
      key: `status-${s}`,
      label: `Status: ${opt?.label ?? s}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          status: filters.status.filter((x) => x !== s),
        }),
    })
  }

  for (const p of filters.priority) {
    const opt = PRIORITY_OPTIONS.find((o) => o.value === p)
    pills.push({
      key: `priority-${p}`,
      label: `Priority: ${opt?.label ?? p}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          priority: filters.priority.filter((x) => x !== p),
        }),
    })
  }

  for (const tag of filters.tags) {
    pills.push({
      key: `tag-${tag}`,
      label: `Tag: ${tag}`,
      onRemove: () =>
        onFiltersChange({
          ...filters,
          tags: filters.tags.filter((x) => x !== tag),
        }),
    })
  }

  if (filters.assignee) {
    const member = workspaceMembers.find((m) => m.id === filters.assignee)
    pills.push({
      key: 'assignee',
      label: `Assignee: ${member?.name ?? 'Unknown'}`,
      onRemove: () => onFiltersChange({ ...filters, assignee: null }),
    })
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Row 1 */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* Left: title */}
        <h1 className="text-xl sm:text-2xl font-bold shrink-0">{title}</h1>

        {/* Right: face pile + view toggle + filter + new task */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Face pile */}
          {workspaceMembers.length > 0 && (
            <div className="flex -space-x-1">
              {workspaceMembers.map((m) => {
                const selected = facePile.includes(m.id)
                return (
                  <button
                    key={m.id}
                    onClick={() => onToggleFacePile(m.id)}
                    title={m.name ?? '?'}
                    className="relative rounded-full transition-transform hover:z-10 hover:scale-110"
                  >
                    <Avatar
                      className={cn(
                        'h-7 w-7 ring-2 transition-all',
                        selected
                          ? 'ring-white scale-110 z-10'
                          : 'ring-background hover:ring-muted-foreground/40',
                      )}
                    >
                      <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name ?? '?'} />
                      <AvatarFallback className="text-[10px]">
                        {(m.name ?? '?').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                )
              })}
            </div>
          )}

          {/* View toggle (Dashboard only) */}
          {showViewToggle && dashboardView != null && onDashboardViewChange && (
            <>
              <div className="w-px h-5 bg-border" />
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => onDashboardViewChange('timeframe')}
                  title="Timeframe"
                  className={cn(
                    'px-1.5 py-1 transition-colors',
                    dashboardView === 'timeframe'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <Calendar className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDashboardViewChange('status')}
                  title="Status"
                  className={cn(
                    'px-1.5 py-1 transition-colors',
                    dashboardView === 'status'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {/* Filter button */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="relative">
                <Filter className="h-4 w-4 mr-1" />
                Filter
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <FilterPopoverContent
                filters={filters}
                onFiltersChange={onFiltersChange}
                onClearFilters={onClearFilters}
                workspaceMembers={workspaceMembers}
              />
            </PopoverContent>
          </Popover>

          {/* New Task */}
          <Button size="sm" onClick={onNewTask}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">New Task</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Row 2: active filter pills (conditional) */}
      {pills.length > 0 && (
        <div
          className="flex items-center gap-1.5 flex-wrap animate-in fade-in slide-in-from-top-1 duration-200"
        >
          {pills.map((pill) => (
            <Badge
              key={pill.key}
              variant="secondary"
              className="gap-1 pr-1 cursor-default"
            >
              {pill.label}
              <button
                onClick={pill.onRemove}
                className="ml-0.5 rounded-full hover:bg-accent p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button
            onClick={onClearFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filter popover content (internal)
// ---------------------------------------------------------------------------

function FilterPopoverContent({
  filters,
  onFiltersChange,
  onClearFilters,
  workspaceMembers,
}: {
  filters: TaskFilters
  onFiltersChange: (f: TaskFilters) => void
  onClearFilters: () => void
  workspaceMembers: WorkspaceMember[]
}) {
  const toggleStatus = useCallback(
    (s: Status) => {
      const next = filters.status.includes(s)
        ? filters.status.filter((x) => x !== s)
        : [...filters.status, s]
      onFiltersChange({ ...filters, status: next })
    },
    [filters, onFiltersChange],
  )

  const togglePriority = useCallback(
    (p: Priority) => {
      const next = filters.priority.includes(p)
        ? filters.priority.filter((x) => x !== p)
        : [...filters.priority, p]
      onFiltersChange({ ...filters, priority: next })
    },
    [filters, onFiltersChange],
  )

  return (
    <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
      {/* Status (multi-select) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Status
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleStatus(opt.value)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                filters.status.includes(opt.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority (multi-select) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Priority
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => togglePriority(opt.value)}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                filters.priority.includes(opt.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tags (existing component) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Tags
        </label>
        <TagCombobox
          selected={filters.tags}
          onChange={(tags) => onFiltersChange({ ...filters, tags })}
        />
      </div>

      {/* Assignee (existing component) */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Assignee
        </label>
        <AssigneePicker
          value={
            filters.assignee
              ? {
                  id: filters.assignee,
                  type:
                    (workspaceMembers.find((m) => m.id === filters.assignee)
                      ?.role as 'human' | 'agent') ?? 'human',
                }
              : null
          }
          onChange={(actor) =>
            onFiltersChange({ ...filters, assignee: actor?.id ?? null })
          }
        />
      </div>

      {/* Clear all */}
      <div className="border-t border-border pt-3">
        <button
          onClick={onClearFilters}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all filters
        </button>
      </div>
    </div>
  )
}
