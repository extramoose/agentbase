import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { chatCompletion } from '@/lib/ai'
import { z } from 'zod'

const schema = z.object({
  context_hint: z.enum(['prep', 'summary']),
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

    // 1. Fetch meeting record
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('title, date, meeting_time')
      .eq('id', entityId)
      .single()

    if (meetingError || !meeting) {
      return Response.json({ error: 'Meeting not found' }, { status: 404 })
    }

    // 2. Fetch linked people names
    const { data: linkedPeople } = await supabase
      .from('meetings_people')
      .select('person_id')
      .eq('meeting_id', entityId)

    let peopleNames = ''
    if (linkedPeople && linkedPeople.length > 0) {
      const personIds = linkedPeople.map((lp) => lp.person_id as string)
      const { data: people } = await supabase
        .from('people')
        .select('name')
        .in('id', personIds)
      peopleNames = (people ?? []).map((p) => p.name as string).join(', ')
    }

    // 3. Fetch stream entries (last 50)
    let streamEntries
    if (actorType === 'agent') {
      const { data } = await supabase.rpc('rpc_list_stream_entries', {
        p_tenant_id: tenantId,
        p_entity_type: 'meeting',
        p_entity_id: entityId,
      })
      streamEntries = data
    } else {
      const { data } = await supabase
        .from('stream_entries')
        .select('*')
        .eq('entity_type', 'meeting')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
        .limit(50)
      streamEntries = data
    }

    // 4. Fetch latest document_version
    const { data: latestVersions } = actorType === 'agent'
      ? await supabase.rpc('rpc_list_document_versions', {
          p_tenant_id: tenantId,
          p_entity_type: 'meeting',
          p_entity_id: entityId,
        })
      : await supabase
          .from('document_versions')
          .select('*')
          .eq('entity_type', 'meeting')
          .eq('entity_id', entityId)
          .order('version_number', { ascending: false })
          .limit(1)

    const latestVersion = Array.isArray(latestVersions) ? latestVersions[0] : null

    // 5. Build prompt based on context_hint
    const streamText = (streamEntries as Array<{ content: string; created_at: string }> ?? [])
      .map(e => `- ${e.content}`)
      .join('\n')

    const currentDoc = latestVersion ? (latestVersion as { content: string }).content : ''

    const meetingDate = (meeting.date as string | null) ?? 'TBD'
    const meetingTime = (meeting.meeting_time as string | null) ?? ''
    const meetingTitle = meeting.title as string

    let systemPrompt: string
    let userPrompt: string

    if (input.context_hint === 'prep') {
      systemPrompt = 'You are preparing a meeting brief for Hunter.'
      userPrompt = `Meeting: ${meetingTitle}\nDate: ${meetingDate}${meetingTime ? ` ${meetingTime}` : ''}\nAttendees: ${peopleNames || 'None specified'}\n\nStream notes:\n${streamText || '(none)'}\n\nExisting prep:\n${currentDoc || '(none)'}\n\nWrite a clear prep brief — purpose, agenda, key questions, context from past meetings if relevant.`
    } else {
      systemPrompt = 'You are writing a meeting summary for Hunter.'
      userPrompt = `Meeting: ${meetingTitle}\nAttendees: ${peopleNames || 'None specified'}\n\nStream/live notes:\n${streamText || '(none)'}\n\nExisting notes:\n${currentDoc || '(none)'}\n\nWrite a concise meeting summary — what was discussed, decisions made, action items.`
    }

    // 6. LLM call for document content
    const content = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    // 7. Separate LLM call for change_summary
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

    // 8. Save document_version
    const nextVersion = latestVersion
      ? ((latestVersion as { version_number: number }).version_number + 1)
      : 1

    const { data: version, error: insertError } = await supabase
      .from('document_versions')
      .insert({
        tenant_id: tenantId,
        entity_type: 'meeting',
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

    // 9. Log to activity_log
    await supabase.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'meeting',
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
