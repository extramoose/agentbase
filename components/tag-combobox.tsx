'use client'

// Inline chip tag input
// - Selected tags show as small removable chips INSIDE the input field
// - Type to filter existing workspace tags
// - Press Enter or click suggestion to add tag
// - Press Backspace on empty input to remove last chip
// - Click x on chip to remove it
// - Create new tags by typing and pressing Enter when no match

import { useState, useRef, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface TagComboboxProps {
  selected: string[]
  onChange: (tags: string[]) => void
  className?: string
}

export function TagCombobox({ selected, onChange, className }: TagComboboxProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Load all workspace tags once
  useEffect(() => {
    supabase.from('tags').select('name').order('name')
      .then(({ data }) => setAllTags((data ?? []).map(t => t.name)))
  }, [])

  // Filter suggestions as user types
  useEffect(() => {
    const q = inputValue.toLowerCase().trim()
    const available = allTags.filter(t => !selected.includes(t))
    if (!q) {
      // Show all available tags when field is open but empty
      setSuggestions(available)
      setOpen(available.length > 0)
      setActiveIndex(-1)
      return
    }
    const filtered = available.filter(t => t.toLowerCase().includes(q))
    setSuggestions(filtered)
    setOpen(filtered.length > 0 || q.length > 0)
    setActiveIndex(-1)
  }, [inputValue, allTags, selected])

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || selected.includes(trimmed)) return
    onChange([...selected, trimmed])
    setInputValue('')
    setOpen(false)
    inputRef.current?.focus()
  }, [selected, onChange])

  const removeTag = useCallback((tag: string) => {
    onChange(selected.filter(t => t !== tag))
  }, [selected, onChange])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addTag(suggestions[activeIndex])
      } else if (inputValue.trim()) {
        addTag(inputValue)
      }
    } else if (e.key === 'Backspace' && !inputValue && selected.length > 0) {
      removeTag(selected[selected.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className={cn('relative', className)}>
      {/* Input area with inline chips */}
      <div
        className="flex flex-wrap gap-1 min-h-9 w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm cursor-text focus-within:ring-1 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              className="hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!inputValue.trim()) {
              const available = allTags.filter(t => !selected.includes(t))
              setSuggestions(available)
              setOpen(available.length > 0)
            } else {
              setOpen(true)
            }
          }}
          onClick={() => {
            if (!inputValue.trim()) {
              const available = allTags.filter(t => !selected.includes(t))
              setSuggestions(available)
              setOpen(available.length > 0)
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={selected.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Suggestions dropdown */}
      {open && (suggestions.length > 0 || inputValue.trim()) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-48 overflow-auto py-1">
            {suggestions.map((tag, i) => (
              <li
                key={tag}
                className={cn(
                  'px-3 py-1.5 text-sm cursor-pointer',
                  i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onMouseDown={(e) => { e.preventDefault(); addTag(tag) }}
              >
                {tag}
              </li>
            ))}
            {inputValue.trim() && !allTags.includes(inputValue.trim()) && (
              <li
                className={cn(
                  'px-3 py-1.5 text-sm cursor-pointer text-muted-foreground',
                  activeIndex === suggestions.length ? 'bg-accent' : 'hover:bg-accent/50'
                )}
                onMouseDown={(e) => { e.preventDefault(); addTag(inputValue) }}
              >
                Create <strong>&quot;{inputValue.trim()}&quot;</strong>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
