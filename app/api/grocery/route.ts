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
      ;({ data, error } = await supabase.rpc('rpc_list_grocery_items', { p_tenant_id: tenantId }))
      if (!error && data) {
        data = filterInMemory(data, q, ['name', 'category'])
        data = paginateInMemory(data, page, limit)
      }
    } else {
      let query = supabase
        .from('grocery_items')
        .select('*')
      query = applySearch(query, q, ['name', 'category'])
      query = query
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      query = applyPagination(query, page, limit)
      ;({ data, error } = await query)
    }

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data, total: data?.length ?? 0, page, limit })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot delete entities' }, { status: 403 })
    }

    const url = new URL(request.url)
    const checked = url.searchParams.get('checked')

    if (checked === 'true') {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('checked', true)

      if (error) return Response.json({ error: error.message }, { status: 400 })

      await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        entity_type: 'grocery_items',
        entity_id: '00000000-0000-0000-0000-000000000000',
        entity_label: 'checked items',
        event_type: 'deleted',
        actor_id: actorId,
        actor_type: actorType,
        payload: { label: 'bulk cleared checked items' },
      })

      return Response.json({ success: true })
    }

    return Response.json({ error: 'Missing query param' }, { status: 400 })
  } catch (err) {
    return apiError(err)
  }
}
