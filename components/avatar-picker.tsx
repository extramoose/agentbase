'use client'

import { useRef, useState } from 'react'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AVATAR_PRESETS = [
  '/avatars/avatar_anonymous.jpg',
  ...Array.from({ length: 11 }, (_, i) => `/avatars/avatar${i + 1}.jpg`),
]

interface AvatarPickerProps {
  selected: string | null
  onSelect: (url: string) => void
  onUpload: (file: File) => void | Promise<void>
}

export function AvatarPicker({ selected, onSelect, onUpload }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const isCustom = selected && !AVATAR_PRESETS.includes(selected)

  if (isCustom) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Avatar className="h-24 w-24">
            <AvatarImage src={selected} alt="Custom avatar" />
          </Avatar>
          <button
            type="button"
            onClick={() => onSelect(AVATAR_PRESETS[0])}
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {AVATAR_PRESETS.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              'rounded-full h-14 w-14 overflow-hidden focus:outline-none transition-all',
              selected === url
                ? 'ring-2 ring-primary'
                : 'hover:opacity-80',
            )}
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={url} alt="Preset avatar" />
            </Avatar>
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? 'Uploading…' : 'Upload custom'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setUploading(true)
            Promise.resolve(onUpload(file)).finally(() => setUploading(false))
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
