'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function SignInPage() {
  async function handleGoogleSignIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">AgentBase</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Multi-agent Life OS
          </p>
        </div>
        <Button
          className="w-full"
          onClick={handleGoogleSignIn}
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  )
}
