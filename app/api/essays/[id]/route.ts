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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot delete entities' }, { status: 403 })
    }

    const { id } = await params

    const { data: entity } = await supabase
      .from('essays')
      .select('title')
      .eq('id', id)
      .single()
    const entityLabel = entity?.title ?? id

    const { error } = await supabase.rpc('rpc_delete_entity', {
      p_table: 'essays',
      p_entity_id: id,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_tenant_id: tenantId,
    })
    if (error) throw error

    await supabase.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'essay',
      entity_id: id,
      entity_label: entityLabel,
      event_type: 'deleted',
      actor_id: actorId,
      actor_type: actorType,
      payload: { label: entityLabel },
    })

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
