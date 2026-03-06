'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Filter,
  X,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagCombobox } from '@/components/tag-combobox'
import { cn } from '@/lib/utils'
import type { ViewType } from '@/components/views'
import type {
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
// useIsMobile hook (inline, no extra file needed)
// ---------------------------------------------------------------------------

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [breakpoint])

  return isMobile
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  /** Page title shown top-left */
  title: string

  /** Optional icon rendered before the title */
  icon?: React.ComponentType<{ className?: string }>

  /** Face pile members */
  workspaceMembers: WorkspaceMember[]
  /** Currently selected member IDs for face pile */
  facePile: string[]
  /** Toggle a member in/out of the face pile */
  onToggleFacePile: (id: string) => void

  /** Hide face pile and force all members selected */
  hideFacePile?: boolean

  /** Optional view selector (Dashboard only) */
  viewType?: ViewType
  onViewChange?: (v: ViewType) => void

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
  icon: Icon,
  workspaceMembers,
  facePile,
  onToggleFacePile,
  viewType,
  onViewChange,
  hideFacePile,
  filters,
  onFiltersChange,
  hasActiveFilters,
  onClearFilters,
  onNewTask,
}: PageHeaderProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  const isMobile = useIsMobile()

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

  // --- Shared filter content (reused by popover and dialog) ---
  const filterContent = (
    <FilterPopoverContent
      filters={filters}
      onFiltersChange={onFiltersChange}
      onClearFilters={onClearFilters}
      workspaceMembers={isMobile ? workspaceMembers : []}
      facePile={isMobile ? facePile : []}
      onToggleFacePile={isMobile ? onToggleFacePile : undefined}
    />
  )

  return (
    <div className="m-4 space-y-2">
      {/* Row 1 */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: icon + title */}
        <div className="flex items-center gap-2 shrink-0">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <h1 className="text-sm font-medium text-muted-foreground" aria-label={title}>
            {viewType !== undefined
              ? new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
              : title}
          </h1>
        </div>

        {/* Right: face pile + view toggle + filter + new task */}
        <div className="flex items-center gap-2">
          {/* Face pile — hidden on mobile (moved into filter panel) */}
          {!hideFacePile && workspaceMembers.length > 0 && (
            <div className="hidden md:flex -space-x-1">
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

          {/* View selector (Dashboard only) */}
          {viewType != null && onViewChange && (
            <Select value={viewType} onValueChange={(v) => onViewChange(v as ViewType)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sticky-timeframe">Sticky - Timeframe</SelectItem>
                <SelectItem value="sticky-status">Sticky - Status</SelectItem>
                <SelectItem value="experiment-a">Experiment A</SelectItem>
                <SelectItem value="experiment-b">Experiment B</SelectItem>
                <SelectItem value="experiment-c">Canvas Board</SelectItem>
                <SelectItem value="personal-board">Personal Board</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Filter button — desktop: popover, mobile: dialog */}
          {isMobile ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="relative"
                onClick={() => setFilterOpen(true)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Filter
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
              <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
                <DialogContent className="fixed inset-4 max-w-none h-auto max-h-[calc(100vh-2rem)] rounded-xl p-0 gap-0 translate-x-0 translate-y-0">
                  <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
                    <DialogTitle className="text-sm font-semibold">Filters</DialogTitle>
                  </DialogHeader>
                  {filterContent}
                </DialogContent>
              </Dialog>
            </>
          ) : (
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
              <PopoverContent align="end" className="w-72 p-0 shadow-xl">
                {filterContent}
              </PopoverContent>
            </Popover>
          )}

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
        <div className="flex items-center gap-1.5 flex-wrap animate-in fade-in slide-in-from-top-1 duration-200">
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
  facePile,
  onToggleFacePile,
}: {
  filters: TaskFilters
  onFiltersChange: (f: TaskFilters) => void
  onClearFilters: () => void
  workspaceMembers: WorkspaceMember[]
  facePile: string[]
  onToggleFacePile?: (id: string) => void
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
    <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
      {/* Assignee face pile — mobile only */}
      {workspaceMembers.length > 0 && onToggleFacePile && (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Members</p>
          <div className="flex flex-wrap gap-2">
            {workspaceMembers.map((m) => {
              const selected = facePile.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => onToggleFacePile(m.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors',
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name ?? '?'} />
                    <AvatarFallback className="text-[8px]">
                      {(m.name ?? '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[80px] truncate">{m.name ?? '?'}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Status (multi-select) */}
      <section>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
          Status
        </label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleStatus(opt.value)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-all',
                filters.status.includes(opt.value)
                  ? 'bg-foreground text-background border-foreground font-medium'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>



      {/* Priority (multi-select) */}
      <section>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
          Priority
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => togglePriority(opt.value)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-all',
                filters.priority.includes(opt.value)
                  ? 'bg-foreground text-background border-foreground font-medium'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>



      {/* Tags — filter only (no create) */}
      <section>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
          Tags
        </label>
        <TagCombobox
          selected={filters.tags}
          onChange={(tags) => onFiltersChange({ ...filters, tags })}
          allowCreate={false}
        />
      </section>

      {/* Clear all */}
      <div className="border-t border-border pt-3">
        <button
          onClick={onClearFilters}
          className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors w-full text-center py-1.5 border-t border-border/40 mt-1"
        >
          Clear all filters
        </button>
      </div>
    </div>
  )
}
