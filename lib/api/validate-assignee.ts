import { SupabaseClient } from '@supabase/supabase-js'

export type ValidAssignee = {
  id: string
  name: string
  type: 'human' | 'agent'
}

type AssigneeResult =
  | { valid: true; assignee_id: string | null; assignee_type: 'human' | 'agent' | null }
  | { valid: false; error: string; valid_assignees: ValidAssignee[] }

/**
 * Validates an assignee_id against workspace members.
 * - "unassigned" → null assignee (explicit opt-out)
 * - valid UUID → resolved assignee_id + auto-detected assignee_type
 * - missing/invalid → error with list of valid assignees
 */
export async function validateAssignee(
  supabase: SupabaseClient,
  tenantId: string,
  assigneeId: string | undefined | null,
): Promise<AssigneeResult> {
  const { data: members, error: membersError } = await supabase.rpc(
    'rpc_get_workspace_members',
    { p_tenant_id: tenantId },
  )
  if (membersError) throw membersError

  const humans: ValidAssignee[] = ((members as any)?.humans ?? []).map(
    (h: any) => ({ id: h.id, name: h.name, type: 'human' as const }),
  )
  const agents: ValidAssignee[] = ((members as any)?.agents ?? []).map(
    (a: any) => ({ id: a.id, name: a.name, type: 'agent' as const }),
  )
  const allMembers = [...humans, ...agents]

  if (assigneeId === 'unassigned') {
    return { valid: true, assignee_id: null, assignee_type: null }
  }

  if (!assigneeId) {
    return {
      valid: false,
      error: 'assignee_id is required. Pass a valid member UUID or "unassigned".',
      valid_assignees: allMembers,
    }
  }

  const match = allMembers.find((m) => m.id === assigneeId)
  if (!match) {
    return {
      valid: false,
      error: 'assignee_id is required. Pass a valid member UUID or "unassigned".',
      valid_assignees: allMembers,
    }
  }

  return { valid: true, assignee_id: match.id, assignee_type: match.type }
}
