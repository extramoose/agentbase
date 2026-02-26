import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

// Normalize entity_type to canonical singular form.
// Agents may send table names (diary_entries, tasks) — map to the form the UI expects.
const ENTITY_TYPE_MAP: Record<string, string> = {
  diary_entries: 'diary',
  tasks: 'task',
  meetings: 'meeting',
  essays: 'essay',
  library_items: 'library_item',
  companies: 'company',
  people: 'person',
  deals: 'deal',
  grocery_items: 'grocery_item',
}
function normalizeEntityType(type: string): string {
  return ENTITY_TYPE_MAP[type] ?? type
}

const createSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().uuid(),
  content: z.string().min(1),
})

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')

    if (!entityType || !entityId) {
      return Response.json({ error: 'entity_type and entity_id are required' }, { status: 400 })
    }

    const normalizedType = normalizeEntityType(entityType)

    if (actorType === 'agent') {
      const { data, error } = await supabase.rpc('rpc_list_stream_entries', {
        p_tenant_id: tenantId,
        p_entity_type: normalizedType,
        p_entity_id: entityId,
      })
      if (error) throw error
      return Response.json({ data })
    }

    const { data, error } = await supabase
      .from('stream_entries')
      .select('*')
      .eq('entity_type', normalizedType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = createSchema.parse(body)
    const normalizedPostType = normalizeEntityType(input.entity_type)

    if (actorType === 'agent') {
      const { data, error } = await supabase.rpc('rpc_create_stream_entry', {
        p_tenant_id: tenantId,
        p_entity_type: normalizedPostType,
        p_entity_id: input.entity_id,
        p_content: input.content,
        p_actor_id: actorId,
        p_actor_type: actorType,
      })
      if (error) throw error
      return Response.json({ data }, { status: 201 })
    }

    const { data, error } = await supabase
      .from('stream_entries')
      .insert({
        tenant_id: tenantId,
        entity_type: normalizedPostType,
        entity_id: input.entity_id,
        content: input.content,
        actor_id: actorId,
        actor_type: actorType,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
