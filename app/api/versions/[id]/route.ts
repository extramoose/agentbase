import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase } = await resolveActorUnified(request)
    const { id } = await params

    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) return Response.json({ error: 'Version not found' }, { status: 404 })

    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorType } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot delete versions' }, { status: 403 })
    }

    const { id } = await params

    const { error } = await supabase
      .from('document_versions')
      .delete()
      .eq('id', id)

    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
