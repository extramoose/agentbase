import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  role: z.enum(['user', 'admin']),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAdminApi()

    const { id } = await params

    // Cannot change your own role
    if (id === profile.id) {
      return Response.json({ error: 'Cannot change your own role' }, { status: 400 })
    }

    // Cannot modify superadmins
    const supabase = await createClient()
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', id)
      .single()

    if (!targetProfile) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetProfile.role === 'superadmin') {
      return Response.json({ error: 'Cannot modify superadmin role' }, { status: 403 })
    }

    const body = await request.json()
    const input = updateSchema.parse(body)

    const { error } = await supabase
      .from('profiles')
      .update({ role: input.role })
      .eq('id', id)

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
