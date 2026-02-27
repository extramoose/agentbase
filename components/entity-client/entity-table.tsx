import { type BaseEntity } from '@/types/entities'

export interface EntityTableColumn<T extends BaseEntity> {
  key: string
  label: string
  render?: (entity: T) => React.ReactNode
}

interface EntityTableProps<T extends BaseEntity> {
  columns: EntityTableColumn<T>[]
  rows: T[]
  onRowClick: (entity: T) => void
}

export function EntityTable<T extends BaseEntity>({
  columns,
  rows,
  onRowClick,
}: EntityTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entity) => (
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
