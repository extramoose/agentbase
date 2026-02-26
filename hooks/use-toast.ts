import { useState, useCallback } from 'react'

export type Toast = {
  id: string
  message: string
  type?: 'default' | 'success' | 'error'
  duration?: number
  action?: { label: string; onClick: () => void }
}

let toastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null

export function toast(options: Omit<Toast, 'id'>) {
  toastFn?.(options)
}

export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((options: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const t: Toast = { ...options, id }
    setToasts(prev => [...prev.slice(-2), t]) // max 3 visible
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id))
    }, options.duration ?? 4000)
  }, [])

  // Register global handler
  toastFn = addToast

  return { toasts, dismiss: (id: string) => setToasts(prev => prev.filter(x => x.id !== id)) }
}
