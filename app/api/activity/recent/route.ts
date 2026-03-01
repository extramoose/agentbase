import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, tenantId } = await resolveActorUnified(request)
    const url = new URL(request.url)

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const actorId = url.searchParams.get('actor_id') || null
    const dateFrom = url.searchParams.get('date_from') || null

    // The RPC doesn't support actor_id / date_from, so when those filters
    // are present we fetch a larger window and filter in memory.
    const needsInMemoryFilter = !!(actorId || dateFrom)
    const fetchLimit = needsInMemoryFilter ? 1000 : limit
    const fetchOffset = needsInMemoryFilter ? 0 : offset

    const { data, error } = await supabase.rpc('rpc_get_recent_activity', {
      p_tenant_id: tenantId,
      p_limit: fetchLimit,
      p_offset: fetchOffset,
    })

    if (error) throw error

    let rows = data as Record<string, unknown>[]

    if (actorId) {
      rows = rows.filter((r) => r.actor_id === actorId)
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime()
      rows = rows.filter((r) => new Date(r.created_at as string).getTime() >= from)
    }

    if (needsInMemoryFilter) {
      rows = rows.slice(offset, offset + limit)
    }

    return Response.json({ data: rows, limit, offset })
  } catch (err) {
    return apiError(err)
  }
}
