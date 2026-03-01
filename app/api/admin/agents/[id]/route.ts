import { createClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/auth'
import { apiError, ApiError, ForbiddenError } from '@/lib/api/errors'

/** PATCH — revoke an active agent (soft delete) */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
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

/** DELETE — permanently delete a revoked agent (owner only) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = await requireAdminApi()

    if (profile.role !== 'owner') {
      throw new ForbiddenError('Only owners can delete agents')
    }

    const { id } = await params
    const supabase = await createClient()

    // Fetch agent — must exist and be revoked
    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, name, revoked_at, tenant_id')
      .eq('id', id)
      .single()

    if (fetchError || !agent) {
      throw new ApiError('Agent not found', 404)
    }

    if (!agent.revoked_at) {
      throw new ApiError('Agent must be revoked before it can be deleted', 409)
    }

    // Capture name before deleting
    const agentName = agent.name

    // Hard delete from agents table
    const { error: deleteError } = await supabase
      .from('agents')
      .delete()
      .eq('id', id)

    if (deleteError) throw new Error(deleteError.message)

    // Log to activity_log (history preserved even after agent row is gone)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activity_log').insert({
      tenant_id: agent.tenant_id,
      entity_type: 'agent',
      entity_id: id,
      entity_label: agentName,
      event_type: 'deleted',
      actor_id: user!.id,
      actor_type: 'human',
      payload: { label: agentName },
    })

    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
