'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/rich-text-editor'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { StreamPanel } from '@/components/stream-panel'
import { VersionHistoryDropdown } from '@/components/version-history-dropdown'
import { SynthesizeButton } from '@/components/synthesize-button'
import { toast } from '@/hooks/use-toast'
import type { DocumentVersion } from '@/lib/types/stream'

type DiaryEntry = {
  id: string
  date: string
  content: string | null
  created_at: string
  updated_at: string
}

type Phase = 'future' | 'today' | 'past'

function getDenverToday(): string {
  return new Date()
    .toLocaleString('en-CA', { timeZone: 'America/Denver' })
    .split(',')[0]
}

function computePhase(dateStr: string): Phase {
  const today = getDenverToday()
  if (dateStr === today) return 'today'
  return dateStr > today ? 'future' : 'past'
}

function formatDisplay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

interface DiaryClientProps {
  entry: DiaryEntry | null
  date: string
}

export function DiaryClient({ entry, date }: DiaryClientProps) {
  const router = useRouter()
  const phase = useMemo<Phase>(() => computePhase(date), [date])
  const [currentEntry, setCurrentEntry] = useState<DiaryEntry | null>(entry)
  const [currentContent, setCurrentContent] = useState(entry?.content ?? '')
  const [viewingVersion, setViewingVersion] = useState<DocumentVersion | null>(
    null
  )
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const denverToday = useMemo(() => getDenverToday(), [])
  const isToday = date === denverToday

  const saveEntry = useCallback(
    async (content: string) => {
      const isEmpty =
        !content || content === '<p></p>' || content.trim() === ''
      if (isEmpty && !currentEntry) return
      if (savingRef.current) return
      savingRef.current = true
      setSaving(true)

      try {
        const res = await fetch('/api/commands/create-diary-entry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, content }),
        })
        const json = await res.json()
        if (!res.ok)
          throw new Error(
            (json as { error?: string }).error ?? 'Save failed'
          )
        setCurrentEntry(json.data as DiaryEntry)
      } catch (err) {
        toast({
          message:
            err instanceof Error ? err.message : 'Failed to save entry',
          type: 'error',
        })
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [date, currentEntry]
  )

  function handleSynthesizeComplete(version: DocumentVersion) {
    setCurrentContent(version.content)
    setViewingVersion(null)
  }

  function handleVersionSelect(content: string) {
    setCurrentContent(content)
  }

  function navigate(targetDate: string) {
    router.push(`/tools/diary/${targetDate}`)
  }

  const displayContent = viewingVersion
    ? viewingVersion.content
    : currentContent

  const isEditable = phase !== 'past' && !viewingVersion

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Calendar day strip nav */}
      <div className="flex items-center justify-between py-4 px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(addDays(date, -1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{formatDisplay(date)}</span>
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(denverToday)}
            >
              Today
            </Button>
          )}
          {saving && (
            <span className="text-xs text-muted-foreground">Saving…</span>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(addDays(date, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Toolbar: Version History + Synthesize buttons */}
      {currentEntry?.id && (
        <div className="flex items-center gap-2 px-2 pb-4 flex-wrap">
          <VersionHistoryDropdown
            entityType="diary"
            entityId={currentEntry.id}
            currentContent={currentContent}
            onVersionSelect={handleVersionSelect}
          />
          {phase === 'today' && (
            <>
              <SynthesizeButton
                entityType="diary"
                entityId={currentEntry.id}
                contextHint="good_morning"
                label="Good Morning"
                onComplete={handleSynthesizeComplete}
              />
              <SynthesizeButton
                entityType="diary"
                entityId={currentEntry.id}
                contextHint="update"
                label="Update"
                onComplete={handleSynthesizeComplete}
              />
              <SynthesizeButton
                entityType="diary"
                entityId={currentEntry.id}
                contextHint="good_night"
                label="Good Night"
                onComplete={handleSynthesizeComplete}
              />
            </>
          )}
        </div>
      )}

      {/* Document area */}
      <div className="flex-1 px-2 pb-4">
        {isEditable ? (
          <RichTextEditor
            value={displayContent}
            onChange={(md) => setCurrentContent(md)}
            onBlur={(md) => saveEntry(md)}
            placeholder="Write today's entry..."
            minHeight="400px"
          />
        ) : (
          <div className="min-h-[400px] rounded-md border border-border p-4">
            <MarkdownRenderer content={displayContent} />
          </div>
        )}
      </div>

      {/* Stream Panel */}
      {currentEntry?.id && (
        <div className="border-t border-border px-2 py-4">
          <StreamPanel entityType="diary" entityId={currentEntry.id} />
        </div>
      )}
    </div>
  )
}
