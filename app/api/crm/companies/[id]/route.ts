import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError, NotFoundError } from '@/lib/api/errors'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { id } = await params
    const isUuid = UUID_RE.test(id)
    const seqId = !isUuid ? Number(id) : NaN

    if (!isUuid && (isNaN(seqId) || seqId <= 0)) {
      throw new NotFoundError('Invalid id')
    }

    let row: Record<string, unknown> | null = null

    if (actorType === 'agent') {
      const { data, error } = await supabase.rpc('rpc_list_companies', { p_tenant_id: tenantId })
      if (error) return Response.json({ error: error.message }, { status: 400 })
      row = (data as Record<string, unknown>[])?.find((r) =>
        (isUuid ? r.id === id : r.seq_id === seqId) && r.deleted_at == null,
      ) ?? null
    } else {
      const col = isUuid ? 'id' : 'seq_id'
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq(col, isUuid ? id : seqId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) return Response.json({ error: error.message }, { status: 400 })
      row = data
    }

    if (!row) throw new NotFoundError()
    return Response.json({ data: row })
  } catch (err) {
    return apiError(err)
  }
}
