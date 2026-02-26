import { requireAuthApi, getTenantId } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
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
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('library_items')
      .select('*')
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
      .from('library_items')
      .insert({ ...input, tenant_id: tenantId })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ data }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
