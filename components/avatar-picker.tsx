'use client'

import { useRef, useState } from 'react'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AVATAR_ANONYMOUS = '/avatars/avatar_anonymous.jpg'
export const AGENT_AVATAR_PRESETS = Array.from({ length: 11 }, (_, i) => `/avatars/avatar${i + 1}.jpg`)
export const AVATAR_PRESETS = [AVATAR_ANONYMOUS, ...AGENT_AVATAR_PRESETS]

interface AvatarPickerProps {
  selected: string | null
  onSelect: (url: string) => void
  onUpload: (file: File) => void | Promise<void>
  /** 'agent' = 11 character presets + upload. 'user' = anonymous + upload only. */
  mode?: 'agent' | 'user'
}

export function AvatarPicker({ selected, onSelect, onUpload, mode = 'agent' }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const presets = mode === 'agent' ? AGENT_AVATAR_PRESETS : [AVATAR_ANONYMOUS]
  const allKnown = mode === 'agent' ? AGENT_AVATAR_PRESETS : [AVATAR_ANONYMOUS]
  const isCustom = selected && !allKnown.includes(selected) && selected !== AVATAR_ANONYMOUS

  // Custom uploaded avatar — show large with X to dismiss
  if (isCustom) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={selected} alt="Custom avatar" />
          </Avatar>
          <button
            type="button"
            onClick={() => onSelect(mode === 'agent' ? AGENT_AVATAR_PRESETS[0] : AVATAR_ANONYMOUS)}
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3">
        {presets.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              'rounded-full h-12 w-12 overflow-hidden focus:outline-none transition-all',
              selected === url
                ? 'ring-2 ring-white'
                : 'hover:opacity-80',
            )}
          >
            <Avatar className="h-full w-full">
              <AvatarImage src={url} alt="Preset avatar" />
            </Avatar>
          </button>
        ))}
        {/* Upload custom button */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="h-12 w-12 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-foreground/40 transition-colors"
          title="Upload custom"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
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
