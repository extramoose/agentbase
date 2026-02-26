'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { LinkPreview } from '@/components/link-preview'
import { cn } from '@/lib/utils'

interface UnfurlInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  label?: string
}

function isUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://')
}

export function UnfurlInput({ value, onChange, placeholder, className, label }: UnfurlInputProps) {
  const [debouncedUrl, setDebouncedUrl] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastValueRef = useRef(value)

  useEffect(() => {
    // If the value changed after a dismiss, re-show preview
    if (dismissed && value !== lastValueRef.current) {
      setDismissed(false)
    }
    lastValueRef.current = value

    if (timerRef.current) clearTimeout(timerRef.current)

    if (!value || !isUrl(value)) {
      setDebouncedUrl(null)
      return
    }

    timerRef.current = setTimeout(() => {
      setDebouncedUrl(value)
    }, 600)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, dismissed])

  return (
    <div>
      {label && (
        <label className="text-xs text-muted-foreground font-medium mb-1 block">{label}</label>
      )}
      <Input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('text-sm', className)}
      />
      {debouncedUrl && !dismissed && (
        <div className="mt-2">
          <LinkPreview
            url={debouncedUrl}
            onDismiss={() => setDismissed(true)}
          />
        </div>
      )}
    </div>
  )
}
