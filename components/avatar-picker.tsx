'use client'

import { useRef } from 'react'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AVATAR_PRESETS = Array.from(
  { length: 12 },
  (_, i) => `/avatars/avatar${i + 1}.jpg`,
)

interface AvatarPickerProps {
  selected: string | null
  onSelect: (url: string) => void
  onUpload: (file: File) => void
}

export function AvatarPicker({ selected, onSelect, onUpload }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
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
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          onClick={() => onSelect(AVATAR_PRESETS[0])}
        >
          Choose from presets instead
        </button>
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
              'rounded-full aspect-square flex items-center justify-center focus:outline-none transition-all',
              selected === url
                ? 'ring-1 ring-white ring-offset-1 ring-offset-background'
                : 'hover:opacity-80',
            )}
          >
            <Avatar className="h-14 w-14">
              <AvatarImage src={url} alt="Preset avatar" />
            </Avatar>
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        Upload custom
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
