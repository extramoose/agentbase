import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const ALLOWED_TABLES = ['tasks', 'meetings', 'library_items', 'companies', 'people', 'deals',
  'grocery_items', 'diary_entries', 'essays', 'stream_entries', 'document_versions'] as const

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  id: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot delete entities' }, { status: 403 })
    }

    const body = await request.json()
    const { table, id } = schema.parse(body)

    // Capture label before delete (best effort)
    const labelCol = ['grocery_items', 'companies', 'people'].includes(table) ? 'name' : 'title'
    const { data: entity } = await supabase.from(table).select(`id, ${labelCol}`).eq('id', id).single()
    const label = entity ? (entity as Record<string, string>)[labelCol] ?? id : id

    const { error } = await supabase.from(table).delete().eq('id', id).eq('tenant_id', tenantId)
    if (error) return apiError(error)

    await supabase.from('activity_log').insert({
      entity_type: table.replace(/_/g, '-').replace(/s$/, ''),
      entity_id: id,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: actorType,
      event_type: 'deleted',
      payload: { label },
    })

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
