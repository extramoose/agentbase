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

    // 3. Fetch essay for title context
    let essay: { title: string } | null = null
    if (actorType === 'agent') {
      const { data } = await supabase.rpc('rpc_get_essay', { p_tenant_id: tenantId, p_essay_id: entityId })
      essay = Array.isArray(data) ? data[0] ?? null : null
    } else {
      const { data } = await supabase.from('essays').select('title').eq('id', entityId).single()
      essay = data
    }

    const streamText = (streamEntries as Array<{ content: string; created_at: string }> ?? [])
      .map(e => `[${e.created_at}] ${e.content}`)
      .join('\n')

    const currentDoc = latestVersion ? (latestVersion as { content: string }).content : ''

    // 4. LLM call for document content
    const systemPrompt = 'You are helping Hunter develop his thinking on a topic over time.'
    const userPrompt = `Essay title: ${essay?.title ?? 'Untitled'}\n\nCurrent document:\n${currentDoc || '(none)'}\n\nNew stream entries:\n${streamText || '(none)'}\n\nProduce an updated, improved version of the essay incorporating the new inputs. Preserve the voice and structure, improve the substance.`

    const content = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    // 5. Separate LLM call for change_summary
    const changeSummary = await chatCompletion([
      {
        role: 'system',
        content: 'Write a one-sentence summary of what changed in this document version. Be concise.',
      },
      {
        role: 'user',
        content: `Previous:\n${currentDoc || '(none)'}\n\nNew:\n${content}`,
      },
    ])

    // 6. Save document_version
    const nextVersion = latestVersion
      ? ((latestVersion as { version_number: number }).version_number + 1)
      : 1

    let version: unknown
    if (actorType === 'agent') {
      const { data, error: rpcError } = await supabase.rpc('rpc_save_document_synthesis', {
        p_tenant_id: tenantId,
        p_entity_type: 'essay',
        p_entity_id: entityId,
        p_version_number: nextVersion,
        p_content: content,
        p_change_summary: changeSummary,
        p_context_hint: input.context_hint,
        p_actor_id: actorId,
        p_actor_type: actorType,
      })
      if (rpcError) throw rpcError
      version = Array.isArray(data) ? data[0] : data
    } else {
      const { data: v, error: insertError } = await supabase
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
      // log activity for human path
      await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        entity_type: 'essay',
        entity_id: entityId,
        event_type: 'document_version_published',
        actor_id: actorId,
        actor_type: actorType,
        payload: { version_number: nextVersion, context_hint: input.context_hint },
      })
      version = v
    }

    return Response.json({ success: true, version })
  } catch (err) {
    return apiError(err)
  }
}
