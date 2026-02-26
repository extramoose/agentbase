import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return Response.json(
      { error: 'OPENROUTER_API_KEY not configured' },
      { status: 501 }
    )
  }

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

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content:
            "Summarize this meeting's key decisions and outcomes in 3-5 bullet points.",
        },
        { role: 'user', content },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('OpenRouter error:', text)
    return Response.json({ error: 'AI service error' }, { status: 502 })
  }

  const json = await res.json()
  const summary =
    json.choices?.[0]?.message?.content ?? 'Unable to generate summary.'

  const { error: updateError } = await supabase
    .from('meetings')
    .update({ meeting_summary: summary })
    .eq('id', id)

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 400 })
  }

  return Response.json({ summary })
}
