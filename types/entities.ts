export type EntityType = 'task' | 'library_item' | 'person' | 'company' | 'deal'

export interface BaseEntity {
  id: string
  seq_id: number | null
  tenant_id: string
  tags: string[]
  assignee_id?: string | null
  assignee_type?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface EntityClientProps<T extends BaseEntity> {
  initialEntities: T[]
  initialSelectedId?: number | null

  entityType: EntityType
  entityLabel: string
  entityLabelPlural: string

  renderGridCard: (entity: T, onClick: () => void) => React.ReactNode
  renderTableRow: (entity: T, onClick: () => void) => React.ReactNode
  renderShelfContent: (entity: T, onChange: (updated: T) => void) => React.ReactNode

  renderFilterChips?: () => React.ReactNode

  onCreateEntity: (data: Partial<T>) => Promise<T>
}

/** Maps EntityType to the Supabase table name */
export const ENTITY_TABLE: Record<EntityType, string> = {
  task: 'tasks',
  library_item: 'library_items',
  person: 'people',
  company: 'companies',
  deal: 'deals',
}
