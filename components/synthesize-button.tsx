'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import type { DocumentVersion } from '@/lib/types/stream'

interface SynthesizeButtonProps {
  entityType: string
  entityId: string
  contextHint: string
  label?: string
  onComplete?: (version: DocumentVersion) => void
}

export function SynthesizeButton({
  entityType,
  entityId,
  contextHint,
  label = 'Synthesize',
  onComplete,
}: SynthesizeButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)

    try {
      const res = await fetch(`/api/${entityType}/${entityId}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_hint: contextHint }),
      })

      if (res.ok) {
        const json = await res.json()
        onComplete?.(json.version as DocumentVersion)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Sparkles className="size-3.5" />
      )}
      {label}
    </Button>
  )
}
