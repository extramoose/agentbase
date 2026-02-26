import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  avatar_url: z.string().url().nullable().optional(),
  full_name: z.string().min(1).max(200).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAdminApi()

    const { id } = await params
    const body = await request.json()
    const input = updateSchema.parse(body)

    const supabase = await createClient()

    // Role change guards
    if (input.role !== undefined) {
      if (id === profile.id) {
        return Response.json({ error: 'Cannot change your own role' }, { status: 400 })
      }

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
    }

    // Build update payload — only include fields that were provided
    const updatePayload: Record<string, string | null> = {}
    if (input.role !== undefined) updatePayload.role = input.role
    if (input.avatar_url !== undefined) updatePayload.avatar_url = input.avatar_url
    if (input.full_name !== undefined) updatePayload.full_name = input.full_name

    if (Object.keys(updatePayload).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)

    if (error) return Response.json({ error: error.message }, { status: 400 })
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
