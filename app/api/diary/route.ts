import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .order('date', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()
  if (!membership)
    return Response.json({ error: 'No workspace' }, { status: 403 })

  let input: z.infer<typeof upsertSchema>
  try {
    const body = await request.json()
    input = upsertSchema.parse(body)
  } catch {
    return Response.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('diary_entries')
    .upsert(
      {
        tenant_id: membership.tenant_id,
        date: input.date,
        content: input.content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,date' }
    )
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data })
}
