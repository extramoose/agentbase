import { createClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  role: z.enum(['member', 'admin']),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    const { id } = await params
    const body = await request.json()
    const { role } = schema.parse(body)
    const supabase = await createClient()

    // Update role in tenant_members for the active workspace
    const { data: tenantId } = await supabase.rpc('get_my_tenant_id')
    if (!tenantId) throw new Error('No active workspace')

    const { error } = await supabase
      .from('tenant_members')
      .update({ role })
      .eq('tenant_id', tenantId)
      .eq('user_id', id)

    if (error) throw new Error(error.message)
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
