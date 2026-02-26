interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000
const MAX_REQUESTS = 60

export function checkRateLimit(actorId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(actorId)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(actorId, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true, retryAfter: 0 }
}
