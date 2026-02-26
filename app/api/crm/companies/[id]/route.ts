import { requireAuthApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const supabase = await createClient()
    const { id } = await params

    const { error } = await supabase.from('companies').delete().eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 400 })

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
