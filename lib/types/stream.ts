export interface StreamEntry {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  content: string
  actor_id: string
  actor_type: 'human' | 'agent'
  created_at: string
}

export interface DocumentVersion {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  version_number: number
  content: string
  change_summary: string
  context_hint: string | null
  actor_id: string
  actor_type: 'human' | 'agent'
  created_at: string
}
