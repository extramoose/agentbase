import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ITEM_TYPES = ['favorite', 'flag', 'restaurant', 'note', 'idea', 'article'] as const

const createSchema = z.object({
  type: z.enum(ITEM_TYPES),
  title: z.string().min(1).max(500),
  url: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  location_name: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  is_public: z.boolean().optional().default(false),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('library_items')
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
    .from('library_items')
    .insert({ ...input, tenant_id: membership.tenant_id })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ data }, { status: 201 })
}
