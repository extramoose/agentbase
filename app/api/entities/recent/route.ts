import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    await requireAuthApi()
    const supabase = await createClient()

    // Fetch top 4 from each entity type, then sort and return top 8
    const [tasks, library] = await Promise.all([
      supabase.from('tasks').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(4),
      supabase.from('library_items').select('id,title,updated_at').is('deleted_at', null).order('updated_at', { ascending: false }).limit(4),
    ])

    type RecentEntity = { id: string; label: string; entity_type: string; updated_at: string }
    const all: RecentEntity[] = [
      ...(tasks.data ?? []).map(r => ({ id: r.id, label: r.title, entity_type: 'tasks', updated_at: r.updated_at })),
      ...(library.data ?? []).map(r => ({ id: r.id, label: r.title, entity_type: 'library_items', updated_at: r.updated_at })),
    ]

    all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return Response.json({ success: true, data: all.slice(0, 8) })
  } catch (err) {
    return apiError(err)
  }
}
