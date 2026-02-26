import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { date } = await params

  const { data: membership } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single()
  if (!membership)
    return Response.json({ error: 'No workspace' }, { status: 403 })

  const { data: entry } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('tenant_id', membership.tenant_id)
    .eq('date', date)
    .single()

  return Response.json({ data: entry ?? null })
}
