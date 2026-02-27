'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityAndComments } from '@/components/activity-and-comments'
import { cn } from '@/lib/utils'
import { type BaseEntity, type EntityType, ENTITY_TABLE } from '@/types/entities'

interface EntityShelfProps<T extends BaseEntity> {
  entity: T
  entityType: EntityType
  onClose: () => void
  children: React.ReactNode
}

export function EntityShelf<T extends BaseEntity>({
  entity,
  entityType,
  onClose,
  children,
}: EntityShelfProps<T>) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full z-50 flex flex-col',
          'bg-card border-l border-border shadow-2xl',
          'w-full sm:w-[480px] sm:max-w-full',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold truncate">
            {entityType === 'task' && entity.seq_id ? `#${entity.seq_id}` : ''}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            {children}
          </div>

          {/* ActivityAndComments — always at bottom, noCollapse */}
          <div className="border-t border-border">
            <ActivityAndComments
              entityType={ENTITY_TABLE[entityType]}
              entityId={entity.id}
              noCollapse
            />
          </div>
        </div>
      </div>
    </>
  )
}
