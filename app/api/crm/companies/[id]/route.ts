import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params

  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 400 })

  return Response.json({ success: true })
}
