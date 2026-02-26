import { requireAuthApi, getTenantId } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string(),
})

export async function GET() {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('diary_entries')
      .select('*')
      .order('date', { ascending: false })

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(request: Request) {
  try {
    await requireAuthApi()

    const tenantId = await getTenantId()
    if (!tenantId)
      return Response.json({ error: 'No workspace' }, { status: 403 })

    const supabase = await createClient()

    const body = await request.json()
    const input = upsertSchema.parse(body)

    const { data, error } = await supabase
      .from('diary_entries')
      .upsert(
        {
          tenant_id: tenantId,
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
  } catch (err) {
    return apiError(err)
  }
}
