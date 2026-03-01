'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AvatarPicker } from '@/components/avatar-picker'

type Step = 'workspace' | 'profile' | 'intro-you' | 'intro-agents'

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={
            i === current
              ? 'h-2 w-2 rounded-full bg-white'
              : 'h-2 w-2 rounded-full bg-muted-foreground/30'
          }
        />
      ))}
    </div>
  )
}

export function OnboardingClient({ skipWorkspace }: { skipWorkspace?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const joined = searchParams.get('joined') === 'true' || skipWorkspace
  const stepParam = searchParams.get('step')

  const skipWs = joined || stepParam === 'profile'
  const [step, setStep] = useState<Step>(skipWs ? 'profile' : 'workspace')
  const [workspaceName, setWorkspaceName] = useState('')
  const [profileName, setProfileName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>('/avatars/avatar_anonymous.jpg')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const steps: Step[] = skipWs
    ? ['profile', 'intro-you', 'intro-agents']
    : ['workspace', 'profile', 'intro-you', 'intro-agents']
  const stepIndex = steps.indexOf(step)

  async function handleCreateWorkspace() {
    if (!workspaceName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }
      setStep('profile')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: profileName.trim() }),
      })
      if (!res.ok) {
        setError('Failed to save profile')
        setLoading(false)
        return
      }
      if (avatarUrl) {
        await fetch('/api/profile/avatar-preset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: avatarUrl }),
        })
      }
      setStep('intro-you')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-8">
        <StepDots current={stepIndex} total={steps.length} />

        {step === 'workspace' && (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome to AgentBase
              </h1>
              <p className="text-sm text-muted-foreground">
                Name your workspace to get started.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCreateWorkspace()
              }}
              className="space-y-4"
            >
              <Input
                type="text"
                placeholder="Acme Inc"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={loading}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !workspaceName.trim()}
              >
                {loading ? 'Creating workspace…' : 'Create workspace'}
              </Button>
            </form>
          </div>
        )}

        {step === 'profile' && (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">
                Set up your profile
              </h1>
              <p className="text-sm text-muted-foreground">
                How should your team see you?
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveProfile()
              }}
              className="space-y-6"
            >
              <Input
                type="text"
                placeholder="Your name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <AvatarPicker
                selected={avatarUrl}
                onSelect={setAvatarUrl}
                onUpload={async (file) => {
                  const body = new FormData()
                  body.append('file', file)
                  const res = await fetch('/api/profile/avatar', { method: 'POST', body })
                  const json = await res.json()
                  if (res.ok && json.avatarUrl) setAvatarUrl(json.avatarUrl)
                }}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                {!skipWs && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('workspace')}
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={loading || !profileName.trim()}
                >
                  {loading ? 'Saving…' : 'Continue'}
                </Button>
              </div>
            </form>
          </div>
        )}

        {step === 'intro-you' && (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">
                How AgentBase works for you
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage tasks, collaborate with your team, and let agents handle
                the rest.
              </p>
            </div>
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 h-48 mb-6">
              <span className="text-sm text-muted-foreground">
                Illustration TBD
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep('profile')}>
                Back
              </Button>
              <Button className="flex-1" onClick={() => setStep('intro-agents')}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 'intro-agents' && (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight">
                How it works for agents
              </h1>
              <p className="text-sm text-muted-foreground">
                Agents pick up tasks, use tools, and report back — all inside
                AgentBase.
              </p>
            </div>
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 h-48 mb-6">
              <span className="text-sm text-muted-foreground">
                Illustration TBD
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStep('intro-you')}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => router.push('/admin/agents?create=true')}>
                  Add your first agent
                </Button>
              </div>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                  onClick={() => router.push('/tools/tasks?create=true')}
                >
                  or create a task
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
