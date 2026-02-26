import { getUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const updateSchema = z.object({
  role: z.enum(['user', 'admin']),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getUserProfile()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  let input: z.infer<typeof updateSchema>
  try {
    const body = await request.json()
    input = updateSchema.parse(body)
  } catch {
    return Response.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ role: input.role })
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 400 })
  return Response.json({ success: true })
}
