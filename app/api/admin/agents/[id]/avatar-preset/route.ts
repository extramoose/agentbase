import { requireAdminApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  url: z.string().min(1).max(200),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi()
    const { id } = await params
    const supabase = await createClient()
    const body = await request.json()
    const { url } = schema.parse(body)
    const { error } = await supabase
      .from('agents')
      .update({ avatar_url: url })
      .eq('id', id)
    if (error) throw error
    return Response.json({ success: true, avatarUrl: url })
  } catch (err) {
    return apiError(err)
  }
}
