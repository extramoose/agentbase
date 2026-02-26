'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function InviteClient({ token }: { token: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAccept() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to accept invite')
        setLoading(false)
        return
      }
      router.push('/')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-8 rounded-xl border border-border bg-card">
        <div className="space-y-2 text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            You&apos;ve been invited
          </h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ve been invited to join a workspace on AgentBase.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center mb-4">{error}</p>
        )}

        <Button
          onClick={handleAccept}
          className="w-full"
          size="lg"
          disabled={loading}
        >
          {loading ? 'Accepting...' : 'Accept invite'}
        </Button>
      </div>
    </div>
  )
}
