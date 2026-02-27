'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// ---------------------------------------------------------------------------
// Pageview tracker — must be inside Suspense (useSearchParams requirement)
// ---------------------------------------------------------------------------

function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (!pathname || !ph) return
    const url = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname
    ph.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, ph])

  return null
}

// ---------------------------------------------------------------------------
// Provider — initialises PostHog once on mount
// ---------------------------------------------------------------------------

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current) return
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
    if (!key) return
    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // we handle this manually above
      capture_pageleave: true,
      autocapture: true,
      session_recording: { maskAllInputs: true },
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.debug()
      },
    })
    initialised.current = true
  }, [])

  return (
    <PHProvider client={posthog}>
      <PostHogPageviewWrapper />
      {children}
    </PHProvider>
  )
}

// Wrapper isolates useSearchParams inside Suspense boundary
function PostHogPageviewWrapper() {
  return (
    <PostHogSuspense>
      <PostHogPageview />
    </PostHogSuspense>
  )
}

function PostHogSuspense({ children }: { children: React.ReactNode }) {
  // Dynamic import of Suspense to keep this file simpler
  const { Suspense } = require('react') as typeof import('react')
  return <Suspense fallback={null}>{children}</Suspense>
}
