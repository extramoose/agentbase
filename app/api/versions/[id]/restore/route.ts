import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot restore versions' }, { status: 403 })
    }

    const { id } = await params

    // Fetch the version to restore
    const { data: oldVersion, error: fetchError } = await supabase
      .from('document_versions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !oldVersion) {
      return Response.json({ error: 'Version not found' }, { status: 404 })
    }

    // Get latest version number for this entity
    const { data: latest } = await supabase
      .from('document_versions')
      .select('version_number')
      .eq('entity_type', oldVersion.entity_type as string)
      .eq('entity_id', oldVersion.entity_id as string)
      .order('version_number', { ascending: false })
      .limit(1)
      .single()

    const nextVersion = ((latest?.version_number as number) ?? 0) + 1

    // Create new version with the restored content
    const { data: newVersion, error: insertError } = await supabase
      .from('document_versions')
      .insert({
        tenant_id: tenantId,
        entity_type: oldVersion.entity_type as string,
        entity_id: oldVersion.entity_id as string,
        version_number: nextVersion,
        content: oldVersion.content as string,
        change_summary: `Restored from v${oldVersion.version_number}`,
        context_hint: 'restore',
        actor_id: actorId,
        actor_type: actorType,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Log to activity_log
    await supabase.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: oldVersion.entity_type as string,
      entity_id: oldVersion.entity_id as string,
      event_type: 'document_version_restored',
      actor_id: actorId,
      actor_type: actorType,
      payload: {
        restored_from_version: oldVersion.version_number,
        new_version: nextVersion,
      },
    })

    return Response.json({ success: true, data: newVersion }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
