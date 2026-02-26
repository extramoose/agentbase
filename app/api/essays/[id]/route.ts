import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await resolveActorUnified(request)
    const { id } = await params

    const { data, error } = await supabase
      .from('essays')
      .select('*')
      .eq('id', id)
      .single()

    if (error) return Response.json({ error: error.message }, { status: 404 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, tenantId } = await resolveActorUnified(request)
    const { id } = await params
    const body = await request.json()
    const fields = body.fields as Record<string, unknown>

    const { data, error } = await supabase.rpc('rpc_update_entity', {
      p_table: 'essays',
      p_entity_id: id,
      p_fields: fields,
      p_actor_id: actorId,
      p_tenant_id: tenantId,
    })

    if (error) throw error
    return Response.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
