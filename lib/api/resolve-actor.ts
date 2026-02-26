import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { UnauthorizedError, RateLimitError } from './errors'
import { checkRateLimit } from './rate-limit'
import { createHash } from 'crypto'

export type ResolvedActor = {
  supabase: SupabaseClient
  actorId: string
  actorType: 'human' | 'agent'
  tenantId: string
  ownerId: string
}

// Agent path: Bearer token is a custom API key.
// Hash it, look up in agents table via SECURITY DEFINER RPC (no secret key needed).
export async function resolveActor(request: Request): Promise<ResolvedActor> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)
  const keyHash = createHash('sha256').update(token).digest('hex')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: agent } = await supabase.rpc('resolve_agent_by_key', { p_key_hash: keyHash })
  if (!agent) throw new UnauthorizedError('Invalid or revoked API key')

  const { allowed, retryAfter } = checkRateLimit(agent.id as string)
  if (!allowed) throw new RateLimitError(retryAfter)

  return {
    supabase,
    actorId: agent.id as string,
    actorType: 'agent',
    tenantId: agent.tenant_id as string,
    ownerId: agent.owner_id as string,
  }
}

// Human path: cookie-based session. Agents never use cookies.
export async function resolveActorUnified(request: Request): Promise<ResolvedActor> {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return resolveActor(request)
  }

  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new UnauthorizedError()

  const { allowed, retryAfter } = checkRateLimit(user.id)
  if (!allowed) throw new RateLimitError(retryAfter)

  const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
  if (!tenantId) throw new UnauthorizedError('No workspace')

  // Cookie path is always a human — agents use Bearer API keys, not cookies
  return {
    supabase,
    actorId: user.id,
    actorType: 'human',
    tenantId: tenantId as string,
    ownerId: user.id,
  }
}
