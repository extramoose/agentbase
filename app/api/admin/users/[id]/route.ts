import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  avatar_url: z.string().url().nullable().optional(),
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['user', 'admin', 'owner']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await request.json()
    const input = schema.parse(body)
    const supabase = await createClient()

    const { error } = await supabase.rpc('admin_update_profile', {
      p_target_id: id,
      p_avatar_url: input.avatar_url ?? null,
      p_full_name: input.full_name ?? null,
      p_role: input.role ?? null,
    })

    if (error) throw new Error(error.message)
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
