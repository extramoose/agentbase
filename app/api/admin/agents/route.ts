import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'
import { randomBytes, createHash } from 'crypto'

const schema = z.object({
  name: z.string().min(1).max(100),
  avatar_url: z.string().url().optional().nullable(),
})

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await request.json()
    const input = schema.parse(body)

    const supabase = await createClient()

    // Get current user (the owner)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: tenantIdData } = await supabase.rpc('get_my_tenant_id')
    if (!tenantIdData) throw new Error('No workspace')

    // Generate API key
    const plainKey = randomBytes(32).toString('hex')
    const keyHash = createHash('sha256').update(plainKey).digest('hex')

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        tenant_id: tenantIdData as string,
        name: input.name,
        avatar_url: input.avatar_url ?? null,
        api_key_hash: keyHash,
        owner_id: user.id,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    return Response.json({
      success: true,
      agent: { id: agent.id, name: agent.name, avatar_url: agent.avatar_url },
      api_key: plainKey, // shown exactly once
    }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
