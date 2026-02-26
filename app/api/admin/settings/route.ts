import { requireAdminApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/errors'

export async function GET() {
  try {
    await requireAdminApi()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_workspace_settings')
    if (error) throw error
    return Response.json({ data })
  } catch (err) {
    return apiError(err)
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminApi()
    const supabase = await createClient()
    const body = await request.json()
    const { name, openrouter_api_key, default_model } = body as {
      name?: string
      openrouter_api_key?: string
      default_model?: string
    }

    const { error } = await supabase.rpc('update_workspace_settings', {
      p_name: name ?? null,
      p_openrouter_api_key: openrouter_api_key ?? null,
      p_default_model: default_model ?? null,
    })
    if (error) throw error
    return Response.json({ success: true })
  } catch (err) {
    return apiError(err)
  }
}
