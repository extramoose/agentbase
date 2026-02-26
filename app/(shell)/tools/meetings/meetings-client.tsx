'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  ChevronLeft,
  Sparkles,
  ListTodo,
  Check,
  X,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MeetingStatus = 'upcoming' | 'in_meeting' | 'ended' | 'closed'

type ProposedTask = {
  id: string
  title: string
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none'
  status: 'pending' | 'approved' | 'dismissed'
}

type Meeting = {
  id: string
  title: string
  status: MeetingStatus
  date: string | null
  meeting_time: string | null
  tags: string[]
  prep_notes: string | null
  live_notes: string | null
  meeting_summary: string | null
  transcript: string | null
  proposed_tasks: ProposedTask[]
  created_at: string
  updated_at: string
}

type CurrentUser = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string
} | null

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  MeetingStatus,
  { label: string; next: MeetingStatus | null; nextLabel: string | null; color: string }
> = {
  upcoming: {
    label: 'Upcoming',
    next: 'in_meeting',
    nextLabel: 'Start Meeting',
    color: 'text-blue-400',
  },
  in_meeting: {
    label: 'In Meeting',
    next: 'ended',
    nextLabel: 'End Meeting',
    color: 'text-green-400',
  },
  ended: {
    label: 'Ended',
    next: 'closed',
    nextLabel: 'Close Meeting',
    color: 'text-yellow-400',
  },
  closed: {
    label: 'Closed',
    next: null,
    nextLabel: null,
    color: 'text-muted-foreground',
  },
}

const STATUS_BADGE_CLASS: Record<MeetingStatus, string> = {
  upcoming: 'bg-blue-500/20 text-blue-400',
  in_meeting: 'bg-green-500/20 text-green-400',
  ended: 'bg-yellow-500/20 text-yellow-400',
  closed: 'bg-muted text-muted-foreground',
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function MeetingsClient({
  initialMeetings,
}: {
  initialMeetings: Meeting[]
  currentUser: CurrentUser
}) {
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)

  const supabase = createClient()

  // ----- Realtime subscription -----

  useEffect(() => {
    const channel = supabase
      .channel('meetings:realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meetings' },
        (payload) => {
          const newMeeting = payload.new as Meeting
          setMeetings((prev) => {
            if (prev.some((m) => m.id === newMeeting.id)) return prev
            return [newMeeting, ...prev]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings' },
        (payload) => {
          const updated = payload.new as Meeting
          setMeetings((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'meetings' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setMeetings((prev) => prev.filter((m) => m.id !== deletedId))
          setSelectedId((prev) => (prev === deletedId ? null : prev))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // ----- Selected meeting (derived) -----

  const selectedMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedId) ?? null,
    [meetings, selectedId]
  )

  // ----- Filtered meetings -----

  const filteredMeetings = useMemo(() => {
    let result = meetings
    if (statusFilter !== 'all') {
      result = result.filter((m) => m.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.tags.some((tag) => tag.toLowerCase().includes(q))
      )
    }
    return result
  }, [meetings, statusFilter, search])

  // ----- Create meeting -----

  const createMeeting = useCallback(async () => {
    const tempId = `temp-${Date.now()}`
    const optimistic: Meeting = {
      id: tempId,
      title: 'New Meeting',
      status: 'upcoming',
      date: new Date().toISOString().slice(0, 10),
      meeting_time: null,
      tags: [],
      prep_notes: null,
      live_notes: null,
      meeting_summary: null,
      transcript: null,
      proposed_tasks: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setMeetings((prev) => [optimistic, ...prev])

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Meeting',
          date: new Date().toISOString().slice(0, 10),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create meeting')

      const created = json.data as Meeting
      setMeetings((prev) =>
        prev.map((m) => (m.id === tempId ? created : m))
      )
      setSelectedId(created.id)
      setMobileDetail(true)
      toast({ type: 'success', message: 'Meeting created' })
    } catch (err) {
      setMeetings((prev) => prev.filter((m) => m.id !== tempId))
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create meeting',
      })
    }
  }, [])

  // ----- Update meeting field via command bus -----

  const updateField = useCallback(
    async (meetingId: string, fields: Record<string, unknown>) => {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === meetingId
            ? { ...m, ...fields, updated_at: new Date().toISOString() }
            : m
        )
      )

      try {
        const res = await fetch('/api/commands/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'meetings', id: meetingId, fields }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Update failed')
      } catch (err) {
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Update failed',
        })
      }
    },
    []
  )

  // ----- Delete meeting -----

  const deleteMeeting = useCallback(
    async (meetingId: string) => {
      const prev = meetings
      setMeetings((m) => m.filter((x) => x.id !== meetingId))
      setSelectedId(null)
      setMobileDetail(false)

      try {
        const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Delete failed')
        toast({ type: 'success', message: 'Meeting deleted' })
      } catch (err) {
        setMeetings(prev)
        toast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Delete failed',
        })
      }
    },
    [meetings]
  )

  // ----- Select meeting -----

  function selectMeeting(id: string) {
    setSelectedId(id)
    setMobileDetail(true)
  }

  const statusTabs: Array<{ value: MeetingStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'in_meeting', label: 'In Meeting' },
    { value: 'ended', label: 'Ended' },
    { value: 'closed', label: 'Closed' },
  ]

  return (
    <div className="flex h-full">
      {/* Left panel: meeting list */}
      <div
        className={cn(
          'flex flex-col border-r border-border w-full sm:w-80 sm:shrink-0',
          mobileDetail && selectedMeeting ? 'hidden sm:flex' : 'flex'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <h1 className="text-xl font-bold shrink-0">Meetings</h1>
          <Button size="sm" onClick={createMeeting}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>

        {/* Search + filter */}
        <div className="p-3 space-y-2 border-b border-border">
          <SearchFilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search meetings..."
          />
          <div className="flex gap-1 flex-wrap">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  'px-2 py-1 text-xs rounded-md transition-colors',
                  statusFilter === tab.value
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting list */}
        <div className="flex-1 overflow-y-auto">
          {filteredMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">No meetings found</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={createMeeting}>
                <Plus className="h-4 w-4 mr-1" />
                Create one
              </Button>
            </div>
          ) : (
            filteredMeetings.map((meeting) => (
              <button
                key={meeting.id}
                onClick={() => selectMeeting(meeting.id)}
                className={cn(
                  'w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors',
                  selectedId === meeting.id && 'bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate flex-1">
                    {meeting.title}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn('text-xs shrink-0', STATUS_BADGE_CLASS[meeting.status])}
                  >
                    {STATUS_CONFIG[meeting.status].label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {meeting.date && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(meeting.date + 'T00:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                  {meeting.tags.length > 0 && (
                    <div className="flex gap-1">
                      {meeting.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                      {meeting.tags.length > 2 && (
                        <span className="text-xs text-muted-foreground">
                          +{meeting.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: meeting detail */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0',
          !mobileDetail || !selectedMeeting ? 'hidden sm:flex' : 'flex'
        )}
      >
        {selectedMeeting ? (
          <MeetingDetail
            meeting={selectedMeeting}
            onUpdate={updateField}
            onDelete={deleteMeeting}
            onBack={() => setMobileDetail(false)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a meeting to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Meeting detail component
// ---------------------------------------------------------------------------

function MeetingDetail({
  meeting,
  onUpdate,
  onDelete,
  onBack,
}: {
  meeting: Meeting
  onUpdate: (id: string, fields: Record<string, unknown>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onBack: () => void
}) {
  const [title, setTitle] = useState(meeting.title)
  const [date, setDate] = useState(meeting.date ?? '')
  const [meetingTime, setMeetingTime] = useState(meeting.meeting_time ?? '')
  const [tags, setTags] = useState<string[]>(meeting.tags)
  const [prepNotes, setPrepNotes] = useState(meeting.prep_notes ?? '')
  const [transcript, setTranscript] = useState(meeting.transcript ?? '')
  const [summary, setSummary] = useState(meeting.meeting_summary ?? '')
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>(
    meeting.proposed_tasks ?? []
  )
  const [summarizing, setSummarizing] = useState(false)
  const [suggestingTasks, setSuggestingTasks] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Sync from props when meeting changes (realtime or selection change)
  useEffect(() => {
    setTitle(meeting.title)
    setDate(meeting.date ?? '')
    setMeetingTime(meeting.meeting_time ?? '')
    setTags(meeting.tags)
    setPrepNotes(meeting.prep_notes ?? '')
    setTranscript(meeting.transcript ?? '')
    setSummary(meeting.meeting_summary ?? '')
    setProposedTasks(meeting.proposed_tasks ?? [])
  }, [meeting])

  function saveField(fields: Record<string, unknown>) {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      onUpdate(meeting.id, fields)
    }, 500)
  }

  function saveFieldImmediate(fields: Record<string, unknown>) {
    clearTimeout(saveTimeout.current)
    onUpdate(meeting.id, fields)
  }

  // ----- Status transition -----

  const cfg = STATUS_CONFIG[meeting.status]

  function advanceStatus() {
    if (!cfg.next) return
    saveFieldImmediate({ status: cfg.next })
  }

  // ----- Summarize -----

  async function handleSummarize() {
    setSummarizing(true)
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/summarize`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Summarize failed')
      setSummary(json.summary)
      toast({ type: 'success', message: 'Summary generated' })
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Summarize failed',
      })
    } finally {
      setSummarizing(false)
    }
  }

  // ----- Suggest tasks -----

  async function handleSuggestTasks() {
    setSuggestingTasks(true)
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/suggest-tasks`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Suggest tasks failed')
      setProposedTasks(json.tasks)
      toast({ type: 'success', message: 'Tasks suggested' })
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Suggest tasks failed',
      })
    } finally {
      setSuggestingTasks(false)
    }
  }

  // ----- Approve / dismiss proposed task -----

  async function approveTask(taskId: string) {
    const task = proposedTasks.find((t) => t.id === taskId)
    if (!task) return

    // Create real task
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          priority: task.priority,
          status: 'todo',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create task')

      // Update proposed_tasks
      const updated = proposedTasks.map((t) =>
        t.id === taskId ? { ...t, status: 'approved' as const } : t
      )
      setProposedTasks(updated)
      saveFieldImmediate({ proposed_tasks: updated })
      toast({ type: 'success', message: 'Task approved and created' })
    } catch (err) {
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to approve task',
      })
    }
  }

  function dismissTask(taskId: string) {
    const updated = proposedTasks.map((t) =>
      t.id === taskId ? { ...t, status: 'dismissed' as const } : t
    )
    setProposedTasks(updated)
    saveFieldImmediate({ proposed_tasks: updated })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="sm:hidden shrink-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              saveField({ title: e.target.value })
            }}
            className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0"
          />
        </div>

        <Badge
          variant="secondary"
          className={cn('shrink-0', STATUS_BADGE_CLASS[meeting.status])}
        >
          {cfg.label}
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-muted/30">
        <span className={cn('text-sm font-medium', cfg.color)}>
          {cfg.label}
        </span>
        {cfg.next && (
          <Button size="sm" onClick={advanceStatus}>
            {cfg.nextLabel}
          </Button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  saveFieldImmediate({ date: e.target.value || null })
                }}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Time
              </label>
              <Input
                type="time"
                value={meetingTime}
                onChange={(e) => {
                  setMeetingTime(e.target.value)
                  saveFieldImmediate({ meeting_time: e.target.value || null })
                }}
                className="text-sm"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Tags
            </label>
            <TagCombobox
              selected={tags}
              onChange={(newTags) => {
                setTags(newTags)
                saveFieldImmediate({ tags: newTags })
              }}
            />
          </div>

          {/* Prep Notes (visible when upcoming) */}
          {meeting.status === 'upcoming' && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Prep Notes
              </label>
              <Textarea
                value={prepNotes}
                onChange={(e) => {
                  setPrepNotes(e.target.value)
                  saveField({ prep_notes: e.target.value })
                }}
                placeholder="Meeting prep notes..."
                className="min-h-[150px] text-sm resize-y"
              />
            </div>
          )}

          {/* Live Notes (visible when in_meeting) */}
          {meeting.status === 'in_meeting' && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Live Notes
              </label>
              <RichTextEditor
                value={meeting.live_notes ?? ''}
                onChange={(md) => saveField({ live_notes: md })}
                onBlur={(md) => saveFieldImmediate({ live_notes: md })}
                placeholder="Type meeting notes..."
                minHeight="300px"
              />
            </div>
          )}

          {/* Live Notes read-only (visible when ended or closed) */}
          {(meeting.status === 'ended' || meeting.status === 'closed') &&
            meeting.live_notes && (
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Meeting Notes
                </label>
                <RichTextEditor
                  value={meeting.live_notes}
                  readOnly
                  minHeight="100px"
                />
              </div>
            )}

          {/* Transcript (visible when ended or closed) */}
          {(meeting.status === 'ended' || meeting.status === 'closed') && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Transcript
              </label>
              {meeting.status === 'ended' ? (
                <Textarea
                  value={transcript}
                  onChange={(e) => {
                    setTranscript(e.target.value)
                    saveField({ transcript: e.target.value })
                  }}
                  placeholder="Paste meeting transcript here..."
                  className="min-h-[200px] text-sm resize-y font-mono"
                />
              ) : (
                <div className="rounded-md border border-border p-3 bg-muted/20 text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {meeting.transcript || 'No transcript'}
                </div>
              )}
            </div>
          )}

          {/* Summary (visible when ended or closed) */}
          {(meeting.status === 'ended' || meeting.status === 'closed') && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Summary
              </label>
              {summary ? (
                <div className="rounded-md border border-border p-3 bg-muted/20 text-sm whitespace-pre-wrap">
                  {summary}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No summary generated yet.</p>
              )}
              {meeting.status === 'ended' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={handleSummarize}
                  disabled={summarizing}
                >
                  {summarizing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  Generate Summary
                </Button>
              )}
            </div>
          )}

          {/* Suggested Tasks (visible when ended or closed) */}
          {(meeting.status === 'ended' || meeting.status === 'closed') && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-muted-foreground font-medium">
                  Suggested Tasks
                </label>
                {meeting.status === 'ended' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSuggestTasks}
                    disabled={suggestingTasks}
                  >
                    {suggestingTasks ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <ListTodo className="h-3 w-3 mr-1" />
                    )}
                    Suggest Tasks
                  </Button>
                )}
              </div>

              {proposedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No suggested tasks yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {proposedTasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border border-border px-3 py-2',
                        task.status === 'approved' && 'opacity-60',
                        task.status === 'dismissed' && 'opacity-40 line-through'
                      )}
                    >
                      <Badge variant="outline" className="text-xs shrink-0">
                        {task.priority}
                      </Badge>
                      <span className="flex-1 text-sm truncate">{task.title}</span>
                      {task.status === 'pending' && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-400 hover:text-green-300"
                            onClick={() => approveTask(task.id)}
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => dismissTask(task.id)}
                            title="Dismiss"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {task.status === 'approved' && (
                        <span className="text-xs text-green-400">Approved</span>
                      )}
                      {task.status === 'dismissed' && (
                        <span className="text-xs text-muted-foreground">Dismissed</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Activity + Comments */}
        <div className="border-t border-border">
          <ActivitySection meetingId={meeting.id} />
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <DeleteConfirmDialog
          onConfirm={() => {
            setShowDeleteConfirm(false)
            onDelete(meeting.id)
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity section (lazy loads ActivityAndComments)
// ---------------------------------------------------------------------------

function ActivitySection({ meetingId }: { meetingId: string }) {
  const [ActivityAndComments, setComponent] = useState<React.ComponentType<{
    entityType: string
    entityId: string
  }> | null>(null)

  useEffect(() => {
    import('@/components/activity-and-comments').then((mod) => {
      setComponent(() => mod.ActivityAndComments)
    })
  }, [])

  if (!ActivityAndComments) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return <ActivityAndComments entityType="meetings" entityId={meetingId} />
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onCancel} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-lg p-6 w-80 shadow-2xl">
        <h3 className="text-base font-semibold mb-2">Delete Meeting</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Are you sure? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </>
  )
}
