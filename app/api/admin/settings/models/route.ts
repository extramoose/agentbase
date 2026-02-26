import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    await requireAdminApi()
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error('Failed to fetch models from OpenRouter')
    const data = await res.json()
    const models = (data.data as Array<{ id: string; name: string }> ?? []).map(
      (m) => ({ id: m.id, name: m.name })
    )
    return Response.json({ models })
  } catch (err) {
    return apiError(err)
  }
}
