import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { broadcastMutation } from '@/lib/api/broadcast'
import { z } from 'zod'

const ALLOWED_TABLES = ['tasks', 'library_items', 'companies', 'people', 'deals'] as const

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  id: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    const body = await request.json()
    const { table, id } = schema.parse(body)

    if (actorType === 'agent' && table === 'tasks') {
      return Response.json({ error: 'Agents cannot delete tasks' }, { status: 403 })
    }

    // Capture label before delete (best effort)
    const labelCol = [, 'companies', 'people'].includes(table) ? 'name' : 'title'
    const { data: entity } = await supabase.from(table).select(`id, ${labelCol}`).eq('id', id).single()
    const label = entity ? (entity as Record<string, string>)[labelCol] ?? id : id

    // Hard delete for tasks; soft delete for CRM + library via RPC (bypasses RLS for agents)
    if (table === 'tasks') {
      const { error } = await supabase.from(table).delete().eq('id', id).eq('tenant_id', tenantId)
      if (error) return apiError(error)

      await supabase.from('activity_log').insert({
        entity_type: table,
        entity_id: id,
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: actorType,
        event_type: 'deleted',
        payload: { label },
      })
    } else {
      // RPC is SECURITY DEFINER — works even when agent has no JWT / auth.uid()
      // It also logs field-level activity automatically
      const { error } = await supabase.rpc('rpc_update_entity', {
        p_table: table,
        p_entity_id: id,
        p_fields: { deleted_at: new Date().toISOString() },
        p_actor_id: actorId,
        p_tenant_id: tenantId,
      })
      if (error) return apiError(error)
    }

    if (actorType === 'agent') {
      broadcastMutation(supabase, table, 'DELETE', id)
    }
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
