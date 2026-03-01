'use client'

import { type EntityType, ENTITY_TABLE } from '@/types/entities'
import { LinkPicker } from './link-picker'

interface LinksSectionProps {
  entityType: EntityType
  entityId: string
}

export function LinksSection({ entityType, entityId }: LinksSectionProps) {
  const sourceTable = ENTITY_TABLE[entityType]

  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1 block">Links</label>
      <LinkPicker sourceType={sourceTable} sourceId={entityId} />
    </div>
  )
}
