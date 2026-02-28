import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { parseListParams, applySearch, applyPagination, filterInMemory, paginateInMemory } from '@/lib/api/list-query'

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { page, limit, q } = parseListParams(request)
    const tag = new URL(request.url).searchParams.get('tag') || null

    let data, error
    if (actorType === 'agent') {
      // DB-level search for agent path requires a migration (future work)
      ;({ data, error } = await supabase.rpc('rpc_list_companies', { p_tenant_id: tenantId }))
      if (!error && data) {
        if (tag) data = data.filter((r: Record<string, unknown>) => Array.isArray(r.tags) && r.tags.includes(tag))
        data = filterInMemory(data, q, ['name', 'website', 'notes'])
        data = paginateInMemory(data, page, limit)
      }
    } else {
      let query = supabase
        .from('companies')
        .select('*')
      if (tag) query = query.contains('tags', [tag])
      query = applySearch(query, q, ['name', 'website', 'notes'])
      query = query.order('name')
      query = applyPagination(query, page, limit)
      ;({ data, error } = await query)
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data, total: data?.length ?? 0, page, limit })
  } catch (err) {
    return apiError(err)
  }
}
