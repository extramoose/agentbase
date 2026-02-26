import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

type SuggestedTask = {
  title: string
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none'
}

type ProposedTask = SuggestedTask & {
  id: string
  status: 'pending' | 'approved' | 'dismissed'
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const apiKey = env.openrouterApiKey
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
        { error: 'No notes or transcript to extract tasks from' },
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
              "Extract actionable tasks from this meeting. Return a JSON array of objects with shape: [{title: string, priority: 'urgent'|'high'|'medium'|'low'|'none'}]. Return only valid JSON, no markdown.",
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
    const raw = json.choices?.[0]?.message?.content ?? '[]'

    let suggested: SuggestedTask[]
    try {
      suggested = JSON.parse(raw)
      if (!Array.isArray(suggested)) suggested = []
    } catch {
      suggested = []
    }

    const tasks: ProposedTask[] = suggested.map((t) => ({
      id: crypto.randomUUID(),
      title: String(t.title || 'Untitled task'),
      priority: ['urgent', 'high', 'medium', 'low', 'none'].includes(t.priority)
        ? t.priority
        : 'medium',
      status: 'pending' as const,
    }))

    const { error: updateError } = await supabase
      .from('meetings')
      .update({ proposed_tasks: tasks })
      .eq('id', id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 400 })
    }

    return Response.json({ tasks })
  } catch (err) {
    return apiError(err)
  }
}
