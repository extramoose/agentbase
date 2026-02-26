'use client'

import { useEffect, useState } from 'react'
import { ActorChip } from '@/components/actor-chip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import type { DocumentVersion } from '@/lib/types/stream'

interface VersionHistoryDropdownProps {
  entityType: string
  entityId: string
  currentContent: string
  onVersionSelect: (content: string) => void
}

export function VersionHistoryDropdown({
  entityType,
  entityId,
  currentContent,
  onVersionSelect,
}: VersionHistoryDropdownProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/versions?entity_type=${entityType}&entity_id=${entityId}`)
      const json = await res.json()
      setVersions((json.data ?? []) as DocumentVersion[])
      setLoading(false)
    }
    load()
  }, [entityType, entityId])

  function handleSelect(version: DocumentVersion) {
    const latest = versions[0]
    if (latest && version.id === latest.id) {
      setSelectedVersion(null)
      onVersionSelect(currentContent)
    } else {
      setSelectedVersion(version.version_number)
      onVersionSelect(version.content)
    }
  }

  async function handleRestore(version: DocumentVersion) {
    const res = await fetch(`/api/versions/${version.id}/restore`, { method: 'POST' })
    if (res.ok) {
      const json = await res.json()
      const restored = json.data as DocumentVersion
      setVersions(prev => [restored, ...prev])
      setSelectedVersion(null)
      onVersionSelect(restored.content)
    }
  }

  async function handleDelete(version: DocumentVersion) {
    const res = await fetch(`/api/versions/${version.id}`, { method: 'DELETE' })
    if (res.ok) {
      setVersions(prev => prev.filter(v => v.id !== version.id))
      if (selectedVersion === version.version_number) {
        setSelectedVersion(null)
      }
    }
  }

  const label = selectedVersion !== null
    ? `v${selectedVersion}`
    : versions.length > 0
      ? 'Latest'
      : 'No versions'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading || versions.length === 0}>
          {label}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {versions.map((version, i) => (
          <div key={version.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => handleSelect(version)}
              className="flex-col items-start gap-1 py-2"
            >
              <div className="flex items-center gap-2 w-full">
                <span className="text-xs font-medium">v{version.version_number}</span>
                <ActorChip actorId={version.actor_id} actorType={version.actor_type} compact className="size-4" />
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{version.change_summary}</p>
            </DropdownMenuItem>
            {/* Show restore/delete on non-latest versions */}
            {i > 0 && (
              <div className="flex gap-1 px-2 pb-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore(version)
                  }}
                >
                  <RotateCcw className="size-3" />
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(version)
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
