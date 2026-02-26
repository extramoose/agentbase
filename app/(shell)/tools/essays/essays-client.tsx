'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/rich-text-editor'
import { StreamPanel } from '@/components/stream-panel'
import { VersionHistoryDropdown } from '@/components/version-history-dropdown'
import { SynthesizeButton } from '@/components/synthesize-button'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { stripMarkdown } from '@/lib/strip-markdown'
import type { DocumentVersion } from '@/lib/types/stream'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Essay = {
  id: string
  tenant_id: string
  title: string
  body: string
  tags: string[]
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EssaysClient({
  initialEssays,
  initialEssayId,
}: {
  initialEssays: Essay[]
  initialEssayId?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [essays, setEssays] = useState<Essay[]>(initialEssays)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(initialEssayId ?? null)
  const [isCreating, setIsCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const initialHandled = useRef(false)
  const isFirstRender = useRef(true)

  // Derived state
  const selectedEssay = useMemo(
    () => essays.find((e) => e.id === selectedId) ?? null,
    [essays, selectedId]
  )

  // Build query string
  const buildQs = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [search])

  // Sync search → URL (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    router.replace(`${window.location.pathname}${buildQs()}`, { scroll: false })
  }, [buildQs, router])

  // Open essay for initialEssayId
  useEffect(() => {
    if (!initialEssayId || initialHandled.current || essays.length === 0) return
    initialHandled.current = true
    if (essays.some((e) => e.id === initialEssayId)) {
      setSelectedId(initialEssayId)
    }
  }, [essays, initialEssayId])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('essays:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'essays' },
        (payload) => {
          const newEssay = payload.new as Essay
          setEssays((prev) => {
            if (prev.some((e) => e.id === newEssay.id)) return prev
            return [newEssay, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'essays' },
        (payload) => {
          const updated = payload.new as Essay
          setEssays((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'essays' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setEssays((prev) => prev.filter((e) => e.id !== deletedId))
          setSelectedId((prev) => (prev === deletedId ? null : prev))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Filtered list
  const filtered = useMemo(() => {
    if (!search.trim()) return essays
    const q = search.toLowerCase()
    return essays.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [essays, search])

  // Select essay
  const selectEssay = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (id) {
        router.replace(`/tools/essays/${id}${buildQs()}`, { scroll: false })
      } else {
        router.replace(`/tools/essays${buildQs()}`, { scroll: false })
      }
    },
    [router, buildQs]
  )

  // Create
  const createEssay = useCallback(
    async (title: string) => {
      if (!title.trim()) return
      setIsCreating(false)
      setNewTitle('')

      const tempId = `temp-${Date.now()}`
      const optimistic: Essay = {
        id: tempId,
        tenant_id: '',
        title: title.trim(),
        body: '',
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setEssays((prev) => [optimistic, ...prev])
      setSelectedId(tempId)

      try {
        const res = await fetch('/api/essays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to create')
        const created = json.data as Essay
        setEssays((prev) => prev.map((e) => (e.id === tempId ? created : e)))
        setSelectedId(created.id)
        router.replace(`/tools/essays/${created.id}${buildQs()}`, { scroll: false })
        toast({ type: 'success', message: 'Essay created' })
      } catch (err) {
        setEssays((prev) => prev.filter((e) => e.id !== tempId))
        setSelectedId(null)
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Failed' })
      }
    },
    [router, buildQs]
  )

  // Update field
  const updateField = useCallback(
    async (essayId: string, fields: Record<string, unknown>) => {
      setEssays((prev) =>
        prev.map((e) =>
          e.id === essayId
            ? ({ ...e, ...fields, updated_at: new Date().toISOString() } as Essay)
            : e
        )
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'essays', id: essayId, fields }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Update failed')
      } catch (err) {
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' })
      }
    },
    []
  )

  // Delete
  const deleteEssay = useCallback(
    async (essayId: string) => {
      const prev = essays
      setEssays((e) => e.filter((x) => x.id !== essayId))
      setSelectedId((id) => (id === essayId ? null : id))

      try {
        const res = await fetch(`/api/essays/${essayId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Delete failed')
        router.replace(`/tools/essays${buildQs()}`, { scroll: false })
        toast({ type: 'success', message: 'Essay deleted' })
      } catch (err) {
        setEssays(prev)
        toast({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' })
      }
    },
    [essays, router, buildQs]
  )

  return (
    <div className="flex h-full">
      {/* ---- Left sidebar: list ---- */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Essays</h1>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search essays..."
            className="h-8 text-sm"
          />
        </div>

        {/* Inline create */}
        {isCreating && (
          <div className="px-3 pb-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createEssay(newTitle)
                if (e.key === 'Escape') {
                  setIsCreating(false)
                  setNewTitle('')
                }
              }}
              onBlur={() => {
                if (newTitle.trim()) {
                  createEssay(newTitle)
                } else {
                  setIsCreating(false)
                }
              }}
              placeholder="Essay title..."
              className="h-8 text-sm"
              autoFocus
            />
          </div>
        )}

        {/* Essay rows */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-sm text-muted-foreground text-center">
              {essays.length === 0 ? 'No essays yet.' : 'No matches.'}
            </p>
          ) : (
            filtered.map((essay) => (
              <button
                key={essay.id}
                onClick={() => selectEssay(essay.id)}
                className={cn(
                  'w-full text-left px-3 py-3 border-b border-border transition-colors',
                  selectedId === essay.id
                    ? 'bg-accent'
                    : 'hover:bg-muted/50'
                )}
              >
                <p className="font-medium text-sm truncate">{essay.title}</p>
                {essay.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {stripMarkdown(essay.body, 100)}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {essay.tags.slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-[10px] px-1 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {new Date(essay.updated_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ---- Right detail ---- */}
      <div className="flex-1 overflow-y-auto">
        {selectedEssay ? (
          <EssayDetail
            essay={selectedEssay}
            onUpdate={updateField}
            onDelete={deleteEssay}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select an essay or create a new one
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function EssayDetail({
  essay,
  onUpdate,
  onDelete,
}: {
  essay: Essay
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [title, setTitle] = useState(essay.title)
  const [body, setBody] = useState(essay.body)
  const [tags, setTags] = useState<string[]>(essay.tags)
  const [viewingVersion, setViewingVersion] = useState<DocumentVersion | null>(null)

  // Sync when essay prop changes (from realtime or list selection)
  useEffect(() => {
    setTitle(essay.title)
    setBody(essay.body)
    setTags(essay.tags)
    setViewingVersion(null)
  }, [essay.id, essay.title, essay.body, essay.tags])

  function handleSynthesizeComplete(version: DocumentVersion) {
    setBody(version.content)
    setViewingVersion(null)
  }

  function handleVersionSelect(content: string) {
    setViewingVersion({ content } as DocumentVersion)
  }

  const displayContent = viewingVersion ? viewingVersion.content : body

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== essay.title) {
              onUpdate(essay.id, { title: e.target.value.trim() })
            }
          }}
          className="text-lg font-semibold border-none bg-transparent px-0 h-auto focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(essay.id)}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Tags */}
      <div className="px-4 pb-2">
        <TagCombobox
          selected={tags}
          onChange={(newTags) => {
            setTags(newTags)
            onUpdate(essay.id, { tags: newTags })
          }}
        />
      </div>

      {/* Toolbar: Version History + Synthesize */}
      <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
        <VersionHistoryDropdown
          entityType="essay"
          entityId={essay.id}
          currentContent={body}
          onVersionSelect={handleVersionSelect}
        />
        <SynthesizeButton
          entityType="essay"
          entityId={essay.id}
          contextHint="update"
          label="Synthesize"
          onComplete={handleSynthesizeComplete}
        />
      </div>

      {/* Document area */}
      <div className="flex-1 px-4 pb-4">
        {viewingVersion ? (
          <div className="min-h-[400px] rounded-md border border-border p-4">
            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
              {displayContent}
            </div>
          </div>
        ) : (
          <RichTextEditor
            value={displayContent}
            onChange={(md) => setBody(md)}
            onBlur={(md) => {
              if (md !== essay.body) {
                onUpdate(essay.id, { body: md })
              }
            }}
            placeholder="Start writing your essay..."
            minHeight="400px"
          />
        )}
      </div>

      {/* Stream Panel */}
      <div className="border-t border-border px-4 py-4">
        <StreamPanel entityType="essay" entityId={essay.id} />
      </div>
    </div>
  )
}
