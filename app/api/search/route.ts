import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { filterInMemory, paginateInMemory } from '@/lib/api/list-query'

const ALL_TYPES = ['tasks', 'people', 'companies', 'deals', 'library', 'grocery'] as const
type SearchType = (typeof ALL_TYPES)[number]

const SEARCH_COLUMNS: Record<SearchType, string[]> = {
  tasks: ['title', 'body'],
  people: ['name', 'email', 'title', 'notes'],
  companies: ['name', 'website', 'notes'],
  deals: ['name', 'notes'],
  library: ['name', 'notes', 'url'],
  grocery: ['name', 'category'],
}

const TABLE_NAMES: Record<SearchType, string> = {
  tasks: 'tasks',
  people: 'people',
  companies: 'companies',
  deals: 'deals',
  library: 'library_items',
  grocery: 'grocery_items',
}

const RPC_NAMES: Record<SearchType, string> = {
  tasks: 'rpc_list_tasks',
  people: 'rpc_list_people',
  companies: 'rpc_list_companies',
  deals: 'rpc_list_deals',
  library: 'rpc_list_library_items',
  grocery: 'rpc_list_grocery_items',
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    if (!q) {
      return Response.json({ error: 'q parameter is required' }, { status: 400 })
    }

    const limitParam = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10) || 10))
    const typesParam = url.searchParams.get('types')
    const requestedTypes: SearchType[] = typesParam
      ? typesParam.split(',').filter((t): t is SearchType => ALL_TYPES.includes(t as SearchType))
      : [...ALL_TYPES]

    if (requestedTypes.length === 0) {
      return Response.json({ error: 'No valid types specified' }, { status: 400 })
    }

    const { supabase, actorType, tenantId } = await resolveActorUnified(request)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Record<string, any[]> = {}

    await Promise.all(
      requestedTypes.map(async (type) => {
        const columns = SEARCH_COLUMNS[type]

        if (actorType === 'agent') {
          // DB-level search for agent path requires a migration (future work)
          const { data } = await supabase.rpc(RPC_NAMES[type], { p_tenant_id: tenantId })
          if (data) {
            const filtered = filterInMemory(data, q, columns)
            results[type] = paginateInMemory(filtered, 1, limitParam)
          } else {
            results[type] = []
          }
        } else {
          const filter = columns.map(col => `${col}.ilike.%${q}%`).join(',')
          const { data } = await supabase
            .from(TABLE_NAMES[type])
            .select('*')
            .or(filter)
            .range(0, limitParam - 1)
          results[type] = data ?? []
        }
      })
    )

    return Response.json({ data: results })
  } catch (err) {
    return apiError(err)
  }
}
