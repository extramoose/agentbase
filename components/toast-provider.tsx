'use client'

import { useToastState } from '@/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ToastProvider() {
  const { toasts, dismiss } = useToastState()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg',
            t.type === 'error' && 'border-destructive/50',
            t.type === 'success' && 'border-green-500/50',
          )}
        >
          <p className="flex-1 text-sm">{t.message}</p>
          {t.action && (
            <button
              onClick={t.action.onClick}
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
