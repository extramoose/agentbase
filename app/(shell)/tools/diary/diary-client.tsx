'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/rich-text-editor'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { ActivityAndComments } from '@/components/activity-and-comments'
import { toast } from '@/hooks/use-toast'

type DiaryEntry = {
  id: string
  date: string
  content: string | null
  summary: string | null
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
  const [currentSummary] = useState(entry?.summary ?? '')
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

  function navigate(targetDate: string) {
    router.push(`/tools/diary/${targetDate}`)
  }

  const isEditable = phase !== 'past'

  const lifecycleLabel = phase === 'future' ? 'Future' : phase === 'today' ? 'Open' : 'Closed'
  const lifecycleClass =
    phase === 'future'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
      : phase === 'today'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
        : 'bg-muted text-muted-foreground'

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
          <Badge className={lifecycleClass}>{lifecycleLabel}</Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(addDays(date, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Hunter Notes */}
      <div className="px-2 pb-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Hunter Notes</h3>
        {isEditable ? (
          <RichTextEditor
            value={currentContent}
            onChange={(md) => setCurrentContent(md)}
            onBlur={(md) => saveEntry(md)}
            placeholder="Write today's entry..."
            minHeight="200px"
          />
        ) : (
          <div className="min-h-[100px] rounded-md border border-border p-4">
            <MarkdownRenderer content={currentContent} />
          </div>
        )}
      </div>

      {/* Comments */}
      {currentEntry && (
        <div className="px-2 pb-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Comments</h3>
          <div className="rounded-md border border-border">
            <ActivityAndComments
              entityType="diary_entries"
              entityId={currentEntry.id}
            />
          </div>
        </div>
      )}

      {/* Conclusion — only when closed */}
      {phase === 'past' && (
        <div className="px-2 pb-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Conclusion</h3>
          <div className="rounded-md border border-border p-4">
            {currentSummary ? (
              <MarkdownRenderer content={currentSummary} />
            ) : (
              <p className="text-sm text-muted-foreground">No conclusion yet.</p>
            )}
            <p className="text-xs italic text-muted-foreground mt-2">Written by Lucy</p>
          </div>
        </div>
      )}
    </div>
  )
}
