import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { parseListParams, parseFilterParams, applySearch, applyFilters, applyPagination, filterInMemory, filterByFieldsInMemory, paginateInMemory } from '@/lib/api/list-query'

const TASK_FILTER_FIELDS = ['status', 'priority', 'assignee_id', 'type']

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { page, limit, q } = parseListParams(request)
    const filters = parseFilterParams(request, TASK_FILTER_FIELDS)

    let data, error
    if (actorType === 'agent') {
      // DB-level search for agent path requires a migration (future work)
      ;({ data, error } = await supabase.rpc('rpc_list_tasks', { p_tenant_id: tenantId }))
      if (!error && data) {
        data = filterByFieldsInMemory(data, filters)
        data = filterInMemory(data, q, ['title', 'body'])
        data = paginateInMemory(data, page, limit)
      }
    } else {
      let query = supabase
        .from('tasks')
        .select('*')
      query = applyFilters(query, filters)
      query = applySearch(query, q, ['title', 'body'])
      query = query
        .order('sort_order', { ascending: true })
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
