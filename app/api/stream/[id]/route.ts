import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, actorId, actorType } = await resolveActorUnified(request)

    if (actorType === 'agent') {
      return Response.json({ error: 'Agents cannot delete stream entries' }, { status: 403 })
    }

    const { id } = await params

    const { error } = await supabase
      .from('stream_entries')
      .delete()
      .eq('id', id)
      .eq('actor_id', actorId)

    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
