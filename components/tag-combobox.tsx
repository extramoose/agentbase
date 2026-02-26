'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagComboboxProps {
  selected: string[]
  onChange: (tags: string[]) => void
  tenantId?: string
  className?: string
}

export function TagCombobox({ selected, onChange, tenantId, className }: TagComboboxProps) {
  const [available, setAvailable] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('tags')
        .select('name')
        .order('name')
      setAvailable((data ?? []).map(t => t.name))
    }
    load()
  }, [tenantId, supabase])

  const filtered = available.filter(t =>
    t.toLowerCase().includes(query.toLowerCase()) && !selected.includes(t)
  )

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange([...selected, trimmed])
    setQuery('')
  }

  function removeTag(tag: string) {
    onChange(selected.filter(t => t !== tag))
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(query) }
          }}
          placeholder="Add tag..."
          className="text-sm"
        />

        {/* Dropdown */}
        {open && (query || filtered.length > 0) && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-border bg-card shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(tag => (
              <button
                key={tag}
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted"
                onMouseDown={() => addTag(tag)}
              >
                {tag}
              </button>
            ))}
            {query.trim() && !available.includes(query.trim()) && (
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2 text-muted-foreground"
                onMouseDown={() => addTag(query)}
              >
                <Plus className="h-3 w-3" />
                Create &ldquo;{query}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
