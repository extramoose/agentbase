import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { UnauthorizedError, RateLimitError } from './errors'
import { checkRateLimit } from './rate-limit'

export type ResolvedActor = {
  supabase: SupabaseClient
  actorId: string
  actorType: 'human' | 'agent'
  tenantId: string
  ownerId: string
}

export async function resolveActor(request: Request): Promise<ResolvedActor> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)

  // Create a Supabase client authenticated with the caller's token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

  // Verify token and get user
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new UnauthorizedError('Invalid or expired token')

  // Rate limiting
  const { allowed, retryAfter } = checkRateLimit(user.id)
  if (!allowed) throw new RateLimitError(retryAfter)

  // Resolve workspace membership
  const { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) throw new UnauthorizedError('Actor is not a member of any workspace')

  // Determine actor type (is this an agent account?)
  const { data: agentOwner } = await supabase
    .from('agent_owners')
    .select('owner_id')
    .eq('agent_id', user.id)
    .single()

  return {
    supabase,
    actorId: user.id,
    actorType: agentOwner ? 'agent' : 'human',
    tenantId: membership.tenant_id,
    ownerId: agentOwner?.owner_id ?? user.id,
  }
}
