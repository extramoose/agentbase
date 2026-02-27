import { resolveActorUnified } from '@/lib/api/resolve-actor'
import { apiError } from '@/lib/api/errors'
import { ApiError } from '@/lib/api/errors'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: Request) {
  try {
    const { supabase, actorId, actorType } = await resolveActorUnified(request)
    if (actorType !== 'human') {
      throw new ApiError('Only human users can upload avatars', 403)
    }

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
    const path = `users/${actorId}/avatar.${ext}`

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
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', actorId)

    return Response.json({ success: true, avatarUrl: publicUrl })
  } catch (err) {
    return apiError(err)
  }
}
