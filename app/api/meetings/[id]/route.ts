import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const { id } = await params

    const { error } = await supabase.rpc('rpc_delete_entity', {
      p_table: 'meetings',
      p_entity_id: id,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_tenant_id: tenantId,
    })
    if (error) throw error

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
