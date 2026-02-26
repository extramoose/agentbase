import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(request: Request) {
  try {
    const { supabase, actorType, tenantId } = await resolveActorUnified(request)
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')

    if (!entityType || !entityId) {
      return Response.json({ error: 'entity_type and entity_id are required' }, { status: 400 })
    }

    if (actorType === 'agent') {
      const { data, error } = await supabase.rpc('rpc_list_document_versions', {
        p_tenant_id: tenantId,
        p_entity_type: entityType,
        p_entity_id: entityId,
      })
      if (error) throw error
      return Response.json({ data })
    }

    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('version_number', { ascending: false })

    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}
