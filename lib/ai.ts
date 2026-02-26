import { createClient } from '@/lib/supabase/server'

export async function getAIConfig(): Promise<{ apiKey: string; model: string }> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('get_workspace_settings')
    const settings = data as { openrouter_api_key?: string; default_model?: string } | null
    if (settings?.openrouter_api_key && settings?.default_model) {
      return { apiKey: settings.openrouter_api_key, model: settings.default_model }
    }
  } catch { /* fall through to env defaults */ }
  return {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.DEFAULT_MODEL ?? 'openai/gpt-4o-mini',
  }
}

export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: { model?: string }
): Promise<string> {
  const { apiKey, model } = await getAIConfig()
  if (!apiKey) {
    throw new Error('No OpenRouter API key configured')
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: options?.model ?? model, messages }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('OpenRouter error:', text)
    throw new Error(`OpenRouter error: ${res.status}`)
  }
  const data = await res.json()
  return (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? ''
}
