import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { broadcastMutation } from '@/lib/api/broadcast'
import { z } from 'zod'

const ALLOWED_TABLES = ['tasks', 'library_items'] as const

// Accept both table names and singular entity types
const ENTITY_TYPE_TO_TABLE: Record<string, typeof ALLOWED_TABLES[number]> = {
  task: 'tasks',
  library_item: 'library_items',
}

const schema = z.object({
  table: z.string().transform((val) => {
    const mapped = ENTITY_TYPE_TO_TABLE[val]
    if (mapped) return mapped
    if ((ALLOWED_TABLES as readonly string[]).includes(val)) return val as typeof ALLOWED_TABLES[number]
    return val // let the refinement below reject it
  }).refine((val): val is typeof ALLOWED_TABLES[number] =>
    (ALLOWED_TABLES as readonly string[]).includes(val),
    { message: `table must be one of: ${ALLOWED_TABLES.join(', ')}` },
  ),
  id: z.string().uuid(),
})

const NAME_TABLES: ReadonlySet<string> = new Set<string>()

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    const body = await request.json()
    const { table, id } = schema.parse(body)

    if (actorType === 'agent' && table === 'tasks') {
      return Response.json({ error: 'Agents cannot delete tasks' }, { status: 403 })
    }

    // Capture label before delete (best effort)
    const labelCol = NAME_TABLES.has(table) ? 'name' : 'title'
    const { data: entity } = await supabase.from(table).select(`id, ${labelCol}`).eq('id', id).single()
    const label = entity ? (entity as Record<string, string>)[labelCol] ?? id : id

    // Hard delete for tasks; soft delete for library via RPC (bypasses RLS for agents)
    if (table === 'tasks') {
      const { error } = await supabase.from(table).delete().eq('id', id).eq('tenant_id', tenantId)
      if (error) return apiError(error)

      await supabase.from('activity_log').insert({
        entity_type: table,
        entity_id: id,
        entity_label: typeof label === 'string' ? label : null,
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: actorType,
        event_type: 'deleted',
        payload: { label },
      })
    } else {
      // RPC is SECURITY DEFINER — works even when agent has no JWT / auth.uid()
      const { error } = await supabase.rpc('rpc_update_entity', {
        p_table: table,
        p_entity_id: id,
        p_fields: { deleted_at: new Date().toISOString() },
        p_actor_id: actorId,
        p_tenant_id: tenantId,
      })
      if (error) return apiError(error)

      // Log a proper "deleted" event so the history feed shows the correct verb.
      // The RPC above only logs field_updated for deleted_at.
      await supabase.from('activity_log').insert({
        entity_type: table,
        entity_id: id,
        entity_label: typeof label === 'string' ? label : null,
        tenant_id: tenantId,
        actor_id: actorId,
        actor_type: actorType,
        event_type: 'deleted',
        payload: { label },
      })
    }

    if (actorType === 'agent') {
      broadcastMutation(supabase, table, 'DELETE', id)
    }
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
