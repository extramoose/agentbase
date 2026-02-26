import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const user = await requireAuthApi()

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
  } catch (err) {
    return apiError(err)
  }
}
