'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/rich-text-editor'
import { ActivityAndComments } from '@/components/activity-and-comments'
import { toast } from '@/hooks/use-toast'

type DiaryEntry = {
  id: string
  date: string
  content: string | null
  created_at: string
  updated_at: string
}

function formatDisplay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function DiaryClient({
  initialEntry,
  initialDate,
}: {
  initialEntry: DiaryEntry | null
  initialDate: string
}) {
  const [currentDate, setCurrentDate] = useState(initialDate)
  const [entry, setEntry] = useState<DiaryEntry | null>(initialEntry)
  const [saving, setSaving] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  // Fetch entry when date changes
  useEffect(() => {
    if (currentDate === initialDate && entry === initialEntry) return

    let cancelled = false
    async function fetchEntry() {
      try {
        const res = await fetch(`/api/diary/${currentDate}`)
        const json = await res.json()
        if (!cancelled) {
          setEntry(json.data ?? null)
        }
      } catch {
        if (!cancelled) {
          setEntry(null)
        }
      }
    }
    fetchEntry()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  const saveEntry = useCallback(
    async (content: string) => {
      // Don't save empty content for a new entry
      const isEmpty =
        !content || content === '<p></p>' || content.trim() === ''
      if (isEmpty && !entry) return

      if (savingRef.current) return
      savingRef.current = true
      setSaving(true)

      try {
        const res = await fetch('/api/diary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: currentDate, content }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Save failed')
        setEntry(json.data)
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
    [currentDate, entry]
  )

  const goToDate = useCallback((date: string) => {
    setCurrentDate(date)
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const isToday = currentDate === today

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Navigation bar */}
      <div className="flex items-center justify-between py-4 px-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => goToDate(addDays(currentDate, -1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => dateInputRef.current?.showPicker()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Calendar className="h-4 w-4" />
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={currentDate}
            onChange={(e) => {
              if (e.target.value) goToDate(e.target.value)
            }}
            className="sr-only"
          />
          {!isToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToDate(today)}
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
          onClick={() => goToDate(addDays(currentDate, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Date heading */}
      <h1 className="text-2xl font-bold px-2 pb-4">
        {formatDisplay(currentDate)}
      </h1>

      {/* Rich text editor */}
      <div className="flex-1 px-2 pb-4">
        <RichTextEditor
          value={entry?.content ?? ''}
          onBlur={(md) => saveEntry(md)}
          placeholder="Write today's entry..."
          minHeight="400px"
        />
      </div>

      {/* Activity & Comments — only when we have a saved entry */}
      {entry?.id && (
        <div className="border-t border-border mt-4">
          <ActivityAndComments
            entityType="diary_entries"
            entityId={entry.id}
          />
        </div>
      )}
    </div>
  )
}
