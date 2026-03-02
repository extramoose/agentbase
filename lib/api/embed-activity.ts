import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fetch activity for a single entity and embed it in the response.
 * Used by single-entity GET endpoints.
 */
export async function embedActivity(
  supabase: SupabaseClient,
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('rpc_get_entity_activity', {
    p_tenant_id: tenantId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_limit: 50,
    p_offset: 0,
    p_event_type: null,
  })
  if (error) return []
  return (data ?? []) as Record<string, unknown>[]
}
