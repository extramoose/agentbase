import { requireAuthApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    await requireAuthApi()
    const supabase = await createClient()

    // Fetch top 3 from each entity type, then sort and return top 8
    const [tasks, meetings, library, companies, people, deals, essays] = await Promise.all([
      supabase.from('tasks').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('meetings').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('library_items').select('id,name,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('companies').select('id,name,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('people').select('id,name,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('deals').select('id,name,updated_at').order('updated_at', { ascending: false }).limit(3),
      supabase.from('essays').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(3),
    ])

    type RecentEntity = { id: string; label: string; entity_type: string; updated_at: string }
    const all: RecentEntity[] = [
      ...(tasks.data ?? []).map(r => ({ id: r.id, label: r.title, entity_type: 'tasks', updated_at: r.updated_at })),
      ...(meetings.data ?? []).map(r => ({ id: r.id, label: r.title, entity_type: 'meetings', updated_at: r.updated_at })),
      ...(library.data ?? []).map(r => ({ id: r.id, label: r.name, entity_type: 'library_items', updated_at: r.updated_at })),
      ...(companies.data ?? []).map(r => ({ id: r.id, label: r.name, entity_type: 'companies', updated_at: r.updated_at })),
      ...(people.data ?? []).map(r => ({ id: r.id, label: r.name, entity_type: 'people', updated_at: r.updated_at })),
      ...(deals.data ?? []).map(r => ({ id: r.id, label: r.name, entity_type: 'deals', updated_at: r.updated_at })),
      ...(essays.data ?? []).map(r => ({ id: r.id, label: r.title, entity_type: 'essays', updated_at: r.updated_at })),
    ]

    all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return Response.json({ success: true, data: all.slice(0, 8) })
  } catch (err) {
    return apiError(err)
  }
}
