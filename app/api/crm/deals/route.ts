import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      ;({ data, error } = await supabase.rpc('rpc_list_deals', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false }))
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
