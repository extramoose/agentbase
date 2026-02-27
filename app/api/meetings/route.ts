import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { parseListParams, applySearch, applyPagination, filterInMemory, paginateInMemory } from '@/lib/api/list-query'

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { page, limit, q } = parseListParams(request)

    let data, error
    if (actorType === 'agent') {
      // DB-level search for agent path requires a migration (future work)
      ;({ data, error } = await supabase.rpc('rpc_list_meetings', { p_tenant_id: tenantId }))
      if (!error && data) {
        data = filterInMemory(data, q, ['title'])
        data = paginateInMemory(data, page, limit)
      }
    } else {
      let query = supabase
        .from('meetings')
        .select('*')
      query = applySearch(query, q, ['title'])
      query = query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      query = applyPagination(query, page, limit)
      ;({ data, error } = await query)
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data, total: data?.length ?? 0, page, limit })
  } catch (err) {
    return apiError(err)
  }
}
