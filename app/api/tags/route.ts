import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, tenantId } = await resolveActorUnified(request)

    const { data, error } = await supabase.rpc('rpc_get_all_tags', {
      p_tenant_id: tenantId,
    })

    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
