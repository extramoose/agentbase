import { createClient } from '@supabase/supabase-js'
import { requireAdminApi } from '@/lib/auth'
import { apiError } from '@/lib/api/errors'
import { z } from 'zod'

const schema = z.object({
  full_name: z.string().min(1).max(100),
  avatar_url: z.string().url().optional().nullable(),
  owner_id: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    await requireAdminApi()
    const body = await request.json()
    const input = schema.parse(body)

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Derive email from name
    const slug = input.full_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const email = `agent-${slug}@agents.internal`

    // 1. Create the Supabase Auth user
    const { data: userResult, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: input.full_name, avatar_url: input.avatar_url ?? null },
    })
    if (createError) throw new Error(createError.message)
    const agentUser = userResult.user

    // 2. Upsert profile row
    await adminClient.from('profiles').upsert({
      id: agentUser.id,
      email,
      full_name: input.full_name,
      avatar_url: input.avatar_url ?? null,
      role: 'user',
    })

    // 3. Add to tenant_members
    await adminClient.from('tenant_members').insert({
      tenant_id: '06f27f36-080e-4b98-9a78-57a45141b582',
      user_id: agentUser.id,
      role: 'agent',
    })

    // 4. Insert into agent_owners
    await adminClient.from('agent_owners').insert({
      agent_id: agentUser.id,
      owner_id: input.owner_id,
    })

    // 5. Generate magic link to capture refresh token
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError) throw new Error(linkError.message)

    const refreshToken = (linkData as { properties?: { hashed_token?: string } })?.properties?.hashed_token ?? null

    return Response.json({
      success: true,
      agent: {
        id: agentUser.id,
        email,
        full_name: input.full_name,
        avatar_url: input.avatar_url ?? null,
      },
      refresh_token: refreshToken,
    }, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
