'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Camera, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AvatarPicker } from '@/components/avatar-picker'

interface AvatarUploadProps {
  currentUrl: string | null
  name: string
  uploadUrl: string
  presetUrl?: string
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
  presetUrl,
  size = 'md',
  onSuccess,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const initials = (name ?? '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  async function handleFileUpload(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(uploadUrl, { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setPreviewUrl(json.avatarUrl)
      onSuccess?.(json.avatarUrl)
      setPopoverOpen(false)
      toast({ type: 'success', message: 'Avatar updated' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  async function handlePresetSelect(url: string) {
    if (!presetUrl) return
    setUploading(true)
    try {
      const res = await fetch(presetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to set avatar')
      setPreviewUrl(url)
      onSuccess?.(url)
      setPopoverOpen(false)
      toast({ type: 'success', message: 'Avatar updated' })
    } catch (err) {
      toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to set avatar' })
    } finally {
      setUploading(false)
    }
  }

  const displayUrl = previewUrl ?? currentUrl ?? '/avatars/avatar_anonymous.jpg'

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div className="relative group">
          <button
            type="button"
            className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={uploading}
          >
            <Avatar className={sizeClasses[size]}>
              <AvatarImage src={displayUrl} alt={name ?? 'User'} />
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
        </div>
      </PopoverTrigger>
      {presetUrl && (
        <PopoverContent className="w-64" align="start">
          <AvatarPicker
            selected={displayUrl}
            onSelect={handlePresetSelect}
            onUpload={handleFileUpload}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}
