import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

const ALLOWED_TABLES = [
  'tasks', 'library_items', 'companies', 'people', 'deals',
] as const

const schema = z.object({
  table: z.enum(ALLOWED_TABLES),
  id: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()),
})

export async function PATCH(request: Request) {
  try {
    const { supabase, actorId, tenantId } = await resolveActorUnified(request)
    const body = await request.json()
    const input = schema.parse(body)

    const { data, error } = await supabase.rpc('rpc_update_entity', {
      p_table: input.table,
      p_entity_id: input.id,
      p_fields: input.fields,
      p_actor_id: actorId,
      p_tenant_id: tenantId,
    })

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return apiError(err)
  }
}
