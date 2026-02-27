'use client'

import { useRef, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface AvatarUploadProps {
  currentUrl: string | null
  name: string
  uploadUrl: string
  size?: 'sm' | 'md' | 'lg'
  onSuccess?: (newUrl: string) => void
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
}

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

export function AvatarUpload({
  currentUrl,
  name,
  uploadUrl,
  size = 'md',
  onSuccess,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so the same file can be re-selected
    e.target.value = ''

    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)

      const res = await fetch(uploadUrl, { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      setPreviewUrl(json.avatarUrl)
      onSuccess?.(json.avatarUrl)
      toast({ type: 'success', message: 'Avatar updated' })
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      })
    } finally {
      setUploading(false)
    }
  }

  const displayUrl = previewUrl ?? currentUrl

  return (
    <div className="relative group">
      <button
        type="button"
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={displayUrl ?? undefined} alt={name} />
          <AvatarFallback className={cn(size === 'sm' && 'text-xs')}>
            {initials}
          </AvatarFallback>
        </Avatar>

        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-full bg-black/60 transition-opacity',
            uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {uploading ? (
            <Loader2 className={cn(iconSizes[size], 'text-white animate-spin')} />
          ) : (
            <Camera className={cn(iconSizes[size], 'text-white')} />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
