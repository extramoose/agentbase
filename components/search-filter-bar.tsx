import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SearchFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  placeholder?: string
  children?: React.ReactNode
  className?: string
  /** Available tags for filtering */
  tags?: string[]
  /** Currently selected tag (null = no filter) */
  selectedTag?: string | null
  /** Called when the user selects or deselects a tag */
  onTagChange?: (tag: string | null) => void
}

export function SearchFilterBar({
  search,
  onSearchChange,
  placeholder = 'Search...',
  children,
  className,
  tags,
  selectedTag,
  onTagChange,
}: SearchFilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 sm:gap-3', className)}>
      <div className="relative flex-1 min-w-[140px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      {tags && tags.length > 0 && onTagChange && (
        <div className="flex items-center gap-1 flex-wrap">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => onTagChange(selectedTag === tag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {children && (
        <div className="flex items-center gap-2 flex-wrap">
          {children}
        </div>
      )}
    </div>
  )
}
