import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createSchema = z.object({
  title: z.string().min(1).max(500),
  status: z
    .enum(['prospect', 'active', 'won', 'lost'])
    .optional()
    .default('prospect'),
  value: z.number().nullable().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })

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

  let input: z.infer<typeof createSchema>
  try {
    const body = await request.json()
    input = createSchema.parse(body)
  } catch {
    return Response.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('deals')
    .insert({ ...input, tenant_id: membership.tenant_id })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data }, { status: 201 })
}
