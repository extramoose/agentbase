import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    let data, error
    if (actorType === 'agent') {
      ;({ data, error } = await supabase.rpc('rpc_list_companies', { p_tenant_id: tenantId }))
    } else {
      ;({ data, error } = await supabase.from('companies').select('*').order('name'))
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
