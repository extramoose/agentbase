import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { parseListParams, parseFilterParams, applySearch, applyFilters, applyPagination, filterInMemory, filterByFieldsInMemory, paginateInMemory } from '@/lib/api/list-query'

const LIBRARY_FILTER_FIELDS = ['type']

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { page, limit, q } = parseListParams(request)
    const filters = parseFilterParams(request, LIBRARY_FILTER_FIELDS)
    const tag = new URL(request.url).searchParams.get('tag') || null

    let data, error
    if (actorType === 'agent') {
      // DB-level search for agent path requires a migration (future work)
      ;({ data, error } = await supabase.rpc('rpc_list_library_items', { p_tenant_id: tenantId }))
      if (!error && data) {
        data = data.filter((r: Record<string, unknown>) => r.deleted_at == null)
        data = filterByFieldsInMemory(data, filters)
        if (tag) data = data.filter((r: Record<string, unknown>) => Array.isArray(r.tags) && r.tags.includes(tag))
        data = filterInMemory(data, q, ['name', 'notes', 'url'])
        data = paginateInMemory(data, page, limit)
      }
    } else {
      let query = supabase
        .from('library_items')
        .select('*')
        .is('deleted_at', null)
      query = applyFilters(query, filters)
      if (tag) query = query.contains('tags', [tag])
      query = applySearch(query, q, ['name', 'notes', 'url'])
      query = query.order('created_at', { ascending: false })
      query = applyPagination(query, page, limit)
      ;({ data, error } = await query)
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data, total: data?.length ?? 0, page, limit })
  } catch (err) {
    return apiError(err)
  }
}
