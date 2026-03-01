'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

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

      const { had_workspace, workspace_name } = data.data ?? data

      if (had_workspace) {
        // State A: existing user — go home with toast
        toast({
          type: 'success',
          message: `Joined ${workspace_name ?? 'workspace'}`,
        })
        router.push('/')
      } else {
        // State B: new user — profile setup + intro (skip workspace step)
        router.push('/onboarding?joined=true')
      }
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
