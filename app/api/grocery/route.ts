import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(500),
  category: z.string().max(200).optional(),
  quantity: z.string().max(100).optional(),
})

export async function GET() {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('grocery_items')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 400 })
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

    const { data, error } = await supabase.rpc('rpc_create_grocery_item', {
      p_tenant_id: tenantId,
      p_actor_id: actorId,
      p_actor_type: actorType,
      p_name: input.name,
      p_category: input.category ?? null,
      p_quantity: input.quantity ?? null,
    })
    if (error) throw error
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const url = new URL(request.url)
    const checked = url.searchParams.get('checked')

    if (checked === 'true') {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('checked', true)

      if (error) return Response.json({ error: error.message }, { status: 400 })
      return Response.json({ success: true })
    }

    return Response.json({ error: 'Missing query param' }, { status: 400 })
  } catch (err) {
    return apiError(err)
  }
}
