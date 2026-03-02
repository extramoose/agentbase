'use client'

import { useRef, useState } from 'react'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AVATAR_ANONYMOUS = '/avatars/avatar_anonymous.jpg'
export const AGENT_AVATAR_PRESETS = Array.from({ length: 11 }, (_, i) => `/avatars/avatar${i + 1}.jpg`)
export const AVATAR_PRESETS = [AVATAR_ANONYMOUS, ...AGENT_AVATAR_PRESETS]

interface AvatarPickerProps {
  selected: string | null
  onSelect: (url: string) => void
  onUpload: (file: File) => void | Promise<void>
  /** 'agent' = 11 character presets. 'user' = anonymous + google + upload only. */
  mode?: 'agent' | 'user'
  /** Google/OAuth avatar URL (user mode only) */
  googleAvatarUrl?: string | null
}

export function AvatarPicker({ selected, onSelect, onUpload, mode = 'agent', googleAvatarUrl }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const presets = mode === 'agent' ? AGENT_AVATAR_PRESETS : []
  const allKnown = mode === 'agent'
    ? AGENT_AVATAR_PRESETS
    : [AVATAR_ANONYMOUS, ...(googleAvatarUrl ? [googleAvatarUrl] : [])]
  const isCustom = selected && !allKnown.includes(selected) && selected !== AVATAR_ANONYMOUS

  // User mode: custom uploaded avatar — show large with X
  if (mode === 'user' && isCustom) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Avatar className="h-24 w-24">
            <AvatarImage src={selected} alt="Custom avatar" />
          </Avatar>
          <button
            type="button"
            onClick={() => onSelect(AVATAR_ANONYMOUS)}
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  // Agent mode: custom uploaded avatar — show large with X
  if (mode === 'agent' && isCustom) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Avatar className="h-24 w-24">
            <AvatarImage src={selected} alt="Custom avatar" />
          </Avatar>
          <button
            type="button"
            onClick={() => onSelect(AGENT_AVATAR_PRESETS[0])}
            className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-muted border border-border flex items-center justify-center hover:bg-destructive hover:border-destructive hover:text-white transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  // User mode: anonymous + google + upload — side by side
  if (mode === 'user') {
    const userOptions = [
      { url: AVATAR_ANONYMOUS, label: 'Default' },
      ...(googleAvatarUrl ? [{ url: googleAvatarUrl, label: 'Google' }] : []),
    ]

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {userOptions.map(({ url, label }) => (
            <button
              key={url}
              type="button"
              onClick={() => onSelect(url)}
              className={cn(
                'rounded-full h-14 w-14 overflow-hidden focus:outline-none transition-all',
                selected === url
                  ? 'ring-[1.5px] ring-white'
                  : 'hover:opacity-80',
              )}
              title={label}
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={url} alt={label} />
              </Avatar>
            </button>
          ))}
          {/* Upload button as a circle */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-14 w-14 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-foreground/40 transition-colors"
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

  // Agent mode: grid of 11 presets + upload
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {presets.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              'rounded-full h-14 w-14 overflow-hidden focus:outline-none transition-all',
              selected === url
                ? 'ring-[1.5px] ring-white'
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
        {uploading ? 'Uploading\u2026' : 'Upload custom'}
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
