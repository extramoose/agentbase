'use client'

import { useRef } from 'react'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {AVATAR_PRESETS.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onSelect(url)}
            className={cn(
              'rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected === url && 'ring-2 ring-primary',
            )}
          >
            <Avatar className="h-12 w-12">
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
