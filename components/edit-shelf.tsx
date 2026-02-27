'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityAndComments } from '@/components/activity-and-comments'
import { cn } from '@/lib/utils'

interface EditShelfProps {
  isOpen: boolean
  onClose: () => void
  title: string
  headerRight?: React.ReactNode
  entityType?: string
  entityId?: string
  children: React.ReactNode
  width?: string
}

export function EditShelf({
  isOpen,
  onClose,
  title,
  headerRight,
  entityType,
  entityId,
  children,
  width = 'w-[520px]',
}: EditShelfProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

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
          width,
          'max-w-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <div className="flex items-center gap-2">
            {headerRight}
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Entity form content */}
          <div className="p-6">
            {children}
          </div>

          {/* Activity + comments — always at bottom if entityId provided */}
          {entityId && entityType && (
            <div className="border-t border-border">
              <ActivityAndComments
                entityType={entityType}
                entityId={entityId}
                noCollapse
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
