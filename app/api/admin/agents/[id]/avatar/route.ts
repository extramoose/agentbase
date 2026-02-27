import { requireAdminApi } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { apiError, ApiError } from '@/lib/api/errors'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi()
    const { id } = await params
    const supabase = await createClient()

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      throw new ApiError('Missing "file" field', 400)
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ApiError('File must be JPEG, PNG, WebP, or GIF', 400)
    }
    if (file.size > MAX_SIZE) {
      throw new ApiError('File must be under 5 MB', 400)
    }

    const ext = EXT_MAP[file.type] ?? 'png'
    const path = `agents/${id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      throw new ApiError(uploadError.message, 500)
    }

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

    await supabase
      .from('agents')
      .update({ avatar_url: publicUrl })
      .eq('id', id)

    return Response.json({ success: true, avatarUrl: publicUrl })
  } catch (err) {
    return apiError(err)
  }
}
