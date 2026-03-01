'use client'

import { useState, useMemo } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type BaseEntity } from '@/types/entities'

export interface EntityTableColumn<T extends BaseEntity> {
  key: string
  label: string
  sortable?: boolean
  render?: (entity: T) => React.ReactNode
}

interface EntityTableProps<T extends BaseEntity> {
  columns: EntityTableColumn<T>[]
  rows: T[]
  onRowClick: (entity: T) => void
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

export function EntityTable<T extends BaseEntity>({
  columns,
  rows,
  onRowClick,
}: EntityTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey]
      const bv = (b as Record<string, unknown>)[sortKey]
      const cmp = compareValues(av, bv)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => {
              const sortable = col.sortable !== false
              const active = sortKey === col.key
              return (
                <th
                  key={col.key}
                  onClick={sortable ? () => handleSort(col.key) : undefined}
                  className={cn(
                    'px-4 py-2 text-left text-xs font-medium text-muted-foreground',
                    sortable && 'cursor-pointer select-none hover:text-foreground',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortable && (
                      active
                        ? sortDir === 'asc'
                          ? <ArrowUp className="h-3 w-3" />
                          : <ArrowDown className="h-3 w-3" />
                        : <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entity) => (
            <tr
              key={entity.id}
              onClick={() => onRowClick(entity)}
              className="border-b border-border last:border-0 hover:bg-accent/40 cursor-pointer transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2">
                  {col.render
                    ? col.render(entity)
                    : String((entity as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
