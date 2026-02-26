import { requireAuthApi, getTenantId } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z
    .enum(['urgent', 'high', 'medium', 'low', 'none'])
    .optional()
    .default('medium'),
  status: z
    .enum(['todo', 'in_progress', 'done', 'blocked'])
    .optional()
    .default('todo'),
  body: z.string().optional(),
})

export async function GET() {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

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
    const input = createSchema.parse(body)

    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...input, tenant_id: tenantId })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
