'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function InviteClient({ token }: { token: string }) {
  const [error, setError] = useState('')

  useEffect(() => {
    async function acceptInvite() {
      try {
        const res = await fetch('/api/invites/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Failed to accept invite')
          return
        }

        const { workspace_name } = data.data ?? data
        toast({
          type: 'success',
          message: `Joined ${workspace_name ?? 'workspace'}`,
        })

        window.location.href = '/tasks'
      } catch {
        setError('Something went wrong. Please try again.')
      }
    }

    acceptInvite()
  }, [token])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-md mx-auto p-8 rounded-xl border border-border bg-card text-center space-y-4">
          <h1 className="text-xl font-semibold">Invite failed</h1>
          <p className="text-sm text-destructive">{error}</p>
          <button
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            onClick={() => { window.location.href = '/' }}
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-8 rounded-xl border border-border bg-card text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Joining workspace…</p>
      </div>
    </div>
  )
}
