// In-memory sliding window rate limiter. Simple and fast, but resets on
// server restart and doesn't share state across multiple instances.
// Fine for a single-instance deployment (Vercel serverless recycles anyway).

interface RateLimitEntry {
  count: number
  windowStart: number
}

const store = new Map<string, RateLimitEntry>()
const WINDOW_MS = 60_000
const MAX_REQUESTS_HUMAN = 60
const MAX_REQUESTS_AGENT = 300

export function checkRateLimit(actorId: string, actorType: 'human' | 'agent' = 'human'): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = store.get(actorId)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(actorId, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }

  const maxRequests = actorType === 'agent' ? MAX_REQUESTS_AGENT : MAX_REQUESTS_HUMAN;
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }

  entry.count++
  return { allowed: true, retryAfter: 0 }
}
