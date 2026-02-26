import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { chatCompletion } from '@/lib/ai'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { id } = await params

    const { data: meeting, error: fetchError } = await supabase
      .from('meetings')
      .select('live_notes, transcript')
      .eq('id', id)
      .single()

    if (fetchError || !meeting) {
      return Response.json({ error: 'Meeting not found' }, { status: 404 })
    }

    const content = [
      meeting.live_notes ? `## Notes\n${meeting.live_notes}` : '',
      meeting.transcript ? `## Transcript\n${meeting.transcript}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    if (!content.trim()) {
      return Response.json(
        { error: 'No notes or transcript to summarize' },
        { status: 400 }
      )
    }

    const summary = await chatCompletion([
      {
        role: 'system',
        content:
          "Summarize this meeting's key decisions and outcomes in 3-5 bullet points.",
      },
      { role: 'user', content },
    ])

    const { error: updateError } = await supabase
      .from('meetings')
      .update({ meeting_summary: summary })
      .eq('id', id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400 })
    }

    return Response.json({ summary })
  } catch (err) {
    return apiError(err)
  }
}
