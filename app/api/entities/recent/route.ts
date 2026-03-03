import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    await requireAuthApi()
    const supabase = await createClient()

    // Fetch recent tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id,title,updated_at')
      .order('updated_at', { ascending: false })
      .limit(8)

    type RecentEntity = { id: string; label: string; entity_type: string; updated_at: string }
    const all: RecentEntity[] = (tasks ?? []).map(r => ({
      id: r.id,
      label: r.title,
      entity_type: 'tasks',
      updated_at: r.updated_at,
    }))

    return Response.json({ success: true, data: all })
  } catch (err) {
    return apiError(err)
  }
}
