// Stub — full implementation in #218
import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { chatCompletion } from '@/lib/ai'
import { z } from 'zod'

const schema = z.object({
  context_hint: z.enum(['update']).optional().default('update'),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const { id: entityId } = await params
    const body = await request.json()
    const input = schema.parse(body)

    // 1. Fetch stream entries (last 50)
    let streamEntries
    if (actorType === 'agent') {
      const { data } = await supabase.rpc('rpc_list_stream_entries', {
        p_tenant_id: tenantId,
        p_entity_type: 'essay',
        p_entity_id: entityId,
      })
      streamEntries = data
    } else {
      const { data } = await supabase
        .from('stream_entries')
        .select('*')
        .eq('entity_type', 'essay')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
        .limit(50)
      streamEntries = data
    }

    // 2. Fetch latest document_version
    const { data: latestVersions } = actorType === 'agent'
      ? await supabase.rpc('rpc_list_document_versions', {
          p_tenant_id: tenantId,
          p_entity_type: 'essay',
          p_entity_id: entityId,
        })
      : await supabase
          .from('document_versions')
          .select('*')
          .eq('entity_type', 'essay')
          .eq('entity_id', entityId)
          .order('version_number', { ascending: false })
          .limit(1)

    const latestVersion = Array.isArray(latestVersions) ? latestVersions[0] : null

    // 3. Build prompt — placeholder, real prompts in #218
    const streamText = (streamEntries as Array<{ content: string; created_at: string }> ?? [])
      .map(e => `[${e.created_at}] ${e.content}`)
      .join('\n')

    const previousContent = latestVersion ? (latestVersion as { content: string }).content : ''

    // 4. LLM call for document content
    const content = await chatCompletion([
      {
        role: 'system',
        content: 'You are synthesizing an essay from stream entries. Combine them into a coherent document.',
      },
      {
        role: 'user',
        content: `Previous version:\n${previousContent || '(none)'}\n\nStream entries:\n${streamText || '(none)'}`,
      },
    ])

    // 5. Separate LLM call for change_summary
    const changeSummary = await chatCompletion([
      {
        role: 'system',
        content: 'Write a one-sentence summary of what changed in this document version. Be concise.',
      },
      {
        role: 'user',
        content: `Previous:\n${previousContent || '(none)'}\n\nNew:\n${content}`,
      },
    ])

    // 6. Save document_version
    const nextVersion = latestVersion
      ? ((latestVersion as { version_number: number }).version_number + 1)
      : 1

    const { data: version, error: insertError } = await supabase
      .from('document_versions')
      .insert({
        tenant_id: tenantId,
        entity_type: 'essay',
        entity_id: entityId,
        version_number: nextVersion,
        content,
        change_summary: changeSummary,
        context_hint: input.context_hint,
        actor_id: actorId,
        actor_type: actorType,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 7. Log to activity_log
    await supabase.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'essay',
      entity_id: entityId,
      event_type: 'document_version_published',
      actor_id: actorId,
      actor_type: actorType,
      payload: { version_number: nextVersion, context_hint: input.context_hint },
    })

    return Response.json({ success: true, version })
  } catch (err) {
    return apiError(err)
  }
}
