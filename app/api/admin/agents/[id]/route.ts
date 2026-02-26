import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const supabase = await createClient()

    const { error } = await supabase
      .from('agents')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(error.message)
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
