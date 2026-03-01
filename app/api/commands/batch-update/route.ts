import { z } from 'zod'
import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { broadcastMutation } from '@/lib/api/broadcast'

const ALLOWED_TABLES = [
  'tasks', 'library_items',
  'companies', 'people', 'deals',
] as const

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  ids: z.array(z.string().uuid()).min(1).max(100),
  fields: z.record(z.string(), z.unknown()),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const { table, ids, fields } = schema.parse(body)

    const { error } = await supabase
      .from(table)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('tenant_id', tenantId)

    if (error) throw error

    const logEntries = ids.map((id) => ({
      entity_type: table,
      entity_id: id,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: actorType,
      event_type: 'updated',
      payload: { fields: Object.keys(fields), batch: true },
    }))
    await supabase.from('activity_log').insert(logEntries)

    if (actorType === 'agent') {
      broadcastMutation(supabase, table, 'UPDATE', ids)
    }
    return Response.json({ success: true, updated: ids.length })
  } catch (err) {
    return apiError(err)
  }
}
