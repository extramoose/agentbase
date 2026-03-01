import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fire-and-forget broadcast notification for agent mutations.
 * Browser clients subscribe to the "agent:mutations" channel and
 * refetch when they receive a message for their table.
 */
export async function broadcastMutation(
  supabase: SupabaseClient,
  table: string,
  event: string,
  id: string | string[],
) {
  const channel = supabase.channel('agent:mutations')
  // Must subscribe before sending — Supabase requires an active subscription
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })
  await channel.send({
    type: 'broadcast',
    event: 'mutation',
    payload: { table, event, id },
  })
  supabase.removeChannel(channel)
}
