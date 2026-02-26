import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { chatCompletion } from '@/lib/ai'
import { z } from 'zod'

const schema = z.object({
  context_hint: z.enum(['good_morning', 'update', 'good_night']),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { supabase, actorId, actorType, tenantId } = await resolveActorUnified(request)
    const { date } = await params
    const body = await request.json()
    const input = schema.parse(body)

    // 1. Get or create diary entry for this date
    const { data: diaryEntry } = await supabase
      .from('diary_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .single()

    if (!diaryEntry) {
      return Response.json({ error: 'Diary entry not found for this date' }, { status: 404 })
    }

    const entityId = diaryEntry.id as string

    // 2. Fetch stream entries (last 50)
    let streamEntries
    if (actorType === 'agent') {
      const { data } = await supabase.rpc('rpc_list_stream_entries', {
        p_tenant_id: tenantId,
        p_entity_type: 'diary',
        p_entity_id: entityId,
      })
      streamEntries = data
    } else {
      const { data } = await supabase
        .from('stream_entries')
        .select('*')
        .eq('entity_type', 'diary')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
        .limit(50)
      streamEntries = data
    }

    // 3. Fetch latest document_version
    const { data: latestVersions } = actorType === 'agent'
      ? await supabase.rpc('rpc_list_document_versions', {
          p_tenant_id: tenantId,
          p_entity_type: 'diary',
          p_entity_id: entityId,
        })
      : await supabase
          .from('document_versions')
          .select('*')
          .eq('entity_type', 'diary')
          .eq('entity_id', entityId)
          .order('version_number', { ascending: false })
          .limit(1)

    const latestVersion = Array.isArray(latestVersions) ? latestVersions[0] : null

    // 4. Build prompt based on context_hint
    const streamText = (streamEntries as Array<{ content: string; created_at: string }> ?? [])
      .map(e => `- ${e.content}`)
      .join('\n')

    const currentDoc = latestVersion ? (latestVersion as { content: string }).content : ''

    let systemPrompt = ''
    let userPrompt = ''

    if (input.context_hint === 'good_morning') {
      systemPrompt = "You are Frank, Hunter's AI assistant. Write in second person, warm and direct."
      userPrompt = `It's a new day. Here are Hunter's stream notes:\n${streamText}\n\nExisting doc: ${currentDoc}\n\nWrite a clear, encouraging morning brief — what today looks like, what to focus on.`
    } else if (input.context_hint === 'update') {
      systemPrompt = "You are updating Hunter's diary with new stream entries."
      userPrompt = `Current document:\n${currentDoc}\n\nNew stream entries:\n${streamText}\n\nProduce an updated document incorporating the new inputs naturally.`
    } else {
      systemPrompt = "You are writing Hunter's end-of-day diary entry."
      userPrompt = `Today's stream:\n${streamText}\n\nCurrent doc:\n${currentDoc}\n\nWrite a concise, honest recap of the day — what was done, what carries forward, any reflections.`
    }

    // 5. Call chatCompletion for document content
    const content = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    // 6. Separate LLM call for change_summary
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

    // 7. Save document_version
    const nextVersion = latestVersion
      ? ((latestVersion as { version_number: number }).version_number + 1)
      : 1

    const { data: version, error: insertError } = await supabase
      .from('document_versions')
      .insert({
        tenant_id: tenantId,
        entity_type: 'diary',
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

    // 8. Log to activity_log
    await supabase.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'diary',
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
