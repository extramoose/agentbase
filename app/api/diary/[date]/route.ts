import { requireAuthApi, getTenantId } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    await requireAuthApi()

    const tenantId = await getTenantId()
    if (!tenantId)
      return Response.json({ error: 'No workspace' }, { status: 403 })

    const supabase = await createClient()
    const { date } = await params

    const { data: entry } = await supabase
      .from('diary_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .single()

    return Response.json({ data: entry ?? null })
  } catch (err) {
    return apiError(err)
  }
}
