import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1).max(500),
  domain: z.string().optional(),
  industry: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export async function GET() {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name')

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthApi()

    const supabase = await createClient()

    const { data: membership } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single()
    if (!membership)
      return Response.json({ error: 'No workspace' }, { status: 403 })

    const body = await request.json()
    const input = createSchema.parse(body)

    const { data, error } = await supabase
      .from('companies')
      .insert({ ...input, tenant_id: membership.tenant_id })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
