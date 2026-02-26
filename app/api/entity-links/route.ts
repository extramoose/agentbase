import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, tenantId } = await resolveActorUnified(request)
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get('sourceType')
    const sourceId = searchParams.get('sourceId')

    if (!sourceType || !sourceId) {
      return Response.json({ error: 'sourceType and sourceId are required' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('rpc_list_entity_links', {
      p_tenant_id: tenantId,
      p_entity_type: sourceType,
      p_entity_id: sourceId,
    })

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
