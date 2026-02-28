import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError, ApiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, tenantId } = await resolveActorUnified(request)
    const url = new URL(request.url)

    const entityType = url.searchParams.get('entity_type')
    const entityId = url.searchParams.get('entity_id')
    if (!entityType || !entityId) {
      throw new ApiError('entity_type and entity_id are required', 400)
    }

    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const eventType = url.searchParams.get('event_type') || null

    const { data, error } = await supabase.rpc('rpc_get_entity_activity', {
      p_tenant_id: tenantId,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_limit: limit,
      p_offset: offset,
      p_event_type: eventType,
    })

    if (error) throw error
    return Response.json({ data, limit, offset })
  } catch (err) {
    return apiError(err)
  }
}
