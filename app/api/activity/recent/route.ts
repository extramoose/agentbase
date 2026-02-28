import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, tenantId } = await resolveActorUnified(request)
    const url = new URL(request.url)

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Number(url.searchParams.get('offset') ?? 0)

    const { data, error } = await supabase.rpc('rpc_get_recent_activity', {
      p_tenant_id: tenantId,
      p_limit: limit,
      p_offset: offset,
    })

    if (error) throw error
    return Response.json({ data, limit, offset })
  } catch (err) {
    return apiError(err)
  }
}
