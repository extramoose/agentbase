'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Plus,
  Trash2,
  ChevronLeft,
  Users,
  Calendar,
  Link2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SearchFilterBar } from '@/components/search-filter-bar'
import { TagCombobox } from '@/components/tag-combobox'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/rich-text-editor'
import { MarkdownRenderer } from '@/components/markdown-renderer'
import { StreamPanel } from '@/components/stream-panel'
import { VersionHistoryDropdown } from '@/components/version-history-dropdown'
import { SynthesizeButton } from '@/components/synthesize-button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DocumentVersion } from '@/lib/types/stream'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MeetingStatus = 'upcoming' | 'in_meeting' | 'ended' | 'closed'

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
  proposed_tasks: unknown[]
  created_at: string
  updated_at: string
}

type Person = {
  id: string
  name: string
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
  { label: string; color: string }
> = {
  upcoming: {
    label: 'Upcoming',
    color: 'text-blue-400',
  },
  in_meeting: {
    label: 'In Meeting',
    color: 'text-green-400',
  },
  ended: {
    label: 'Closed',
    color: 'text-muted-foreground',
  },
  closed: {
    label: 'Closed',
    color: 'text-muted-foreground',
  },
}

const STATUS_BADGE_CLASS: Record<MeetingStatus, string> = {
  upcoming: 'bg-blue-500/20 text-blue-400',
  in_meeting: 'bg-green-500/20 text-green-400',
  ended: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function MeetingsClient({
  initialMeetings,
  initialMeetingId,
}: {
  initialMeetings: Meeting[]
  currentUser: CurrentUser
  initialMeetingId?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)

  const supabase = createClient()
  const initialHandled = useRef(false)

  // Build query string from current search state
  const buildQs = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [search])

  // Sync search state → URL query params (skip initial render)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    router.replace(`${window.location.pathname}${buildQs()}`, { scroll: false })
  }, [buildQs, router])

  // Open detail for initialMeetingId after data is available
  useEffect(() => {
    if (!initialMeetingId || initialHandled.current || meetings.length === 0) return
    initialHandled.current = true
    const meeting = meetings.find(m => m.id === initialMeetingId)
    if (meeting) {
      setSelectedId(meeting.id)
      setMobileDetail(true)
    }
  }, [meetings, initialMeetingId])

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
  }, [])

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
      const res = await fetch('/api/commands/create-meeting', {
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
      router.replace(`/tools/meetings/${created.id}${buildQs()}`, { scroll: false })
      toast({ type: 'success', message: 'Meeting created' })
    } catch (err) {
      setMeetings((prev) => prev.filter((m) => m.id !== tempId))
      toast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create meeting',
      })
    }
  }, [router, buildQs])

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
      router.replace(`/tools/meetings${buildQs()}`, { scroll: false })

      try {
        const res = await fetch('/api/commands/delete-entity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: 'meetings', id: meetingId }),
        })
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
    [meetings, router, buildQs]
  )

  // ----- Select meeting -----

  function selectMeeting(id: string) {
    setSelectedId(id)
    setMobileDetail(true)
    router.replace(`/tools/meetings/${id}${buildQs()}`, { scroll: false })
  }

  const statusTabs: Array<{ value: MeetingStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'in_meeting', label: 'In Meeting' },
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
  const supabase = createClient()

  const [title, setTitle] = useState(meeting.title)
  const [date, setDate] = useState(meeting.date ?? '')
  const [meetingTime, setMeetingTime] = useState(meeting.meeting_time ?? '')
  const [tags, setTags] = useState<string[]>(meeting.tags)
  const [docContent, setDocContent] = useState('')
  const [viewingVersion, setViewingVersion] = useState<DocumentVersion | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Linked people state
  const [linkedPeopleIds, setLinkedPeopleIds] = useState<string[]>([])
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [pastMeetings, setPastMeetings] = useState<Array<{ id: string; title: string; scheduled_at: string }>>([])

  // Sync from props when meeting changes (realtime or selection change)
  useEffect(() => {
    setTitle(meeting.title)
    setDate(meeting.date ?? '')
    setMeetingTime(meeting.meeting_time ?? '')
    setTags(meeting.tags)
    setViewingVersion(null)

    // Set doc content based on phase
    if (meeting.status === 'upcoming') {
      setDocContent(meeting.prep_notes ?? '')
    } else if (meeting.status === 'in_meeting') {
      setDocContent(meeting.live_notes ?? '')
    } else {
      // ended or closed
      setDocContent(meeting.meeting_summary ?? '')
    }
  }, [meeting])

  // Fetch linked people and all people for linking
  useEffect(() => {
    supabase.from('meetings_people').select('person_id').eq('meeting_id', meeting.id)
      .then(({ data }) => setLinkedPeopleIds((data ?? []).map((r) => r.person_id as string)))

    supabase.from('people').select('id, name').order('name')
      .then(({ data }) => setAllPeople((data ?? []) as Person[]))
  }, [meeting.id])

  // Fetch past meetings with same people
  useEffect(() => {
    if (linkedPeopleIds.length === 0) {
      setPastMeetings([])
      return
    }

    async function fetchPastMeetings() {
      // Get all meetings that share linked people (via meetings_people)
      const { data: overlappingLinks } = await supabase
        .from('meetings_people')
        .select('meeting_id')
        .in('person_id', linkedPeopleIds)

      if (!overlappingLinks || overlappingLinks.length === 0) {
        setPastMeetings([])
        return
      }

      const meetingIds = [...new Set(
        overlappingLinks
          .map((r) => r.meeting_id as string)
          .filter((id) => id !== meeting.id)
      )]

      if (meetingIds.length === 0) {
        setPastMeetings([])
        return
      }

      const { data } = await supabase
        .from('meetings')
        .select('id, title, date, status')
        .in('id', meetingIds)
        .eq('status', 'closed')
        .order('date', { ascending: false })
        .limit(3)

      setPastMeetings(
        (data ?? []).map((m) => ({
          id: m.id as string,
          title: m.title as string,
          scheduled_at: (m.date as string | null) ?? '',
        }))
      )
    }

    fetchPastMeetings()
  }, [linkedPeopleIds, meeting.id])

  function saveFieldImmediate(fields: Record<string, unknown>) {
    onUpdate(meeting.id, fields)
  }

  // ----- People linking -----

  async function linkPerson(personId: string) {
    setLinkedPeopleIds((prev) => [...prev, personId])
    const { error } = await supabase.from('meetings_people').insert({ meeting_id: meeting.id, person_id: personId })
    if (error) {
      setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
      toast({ type: 'error', message: 'Failed to link person' })
    }
  }

  async function unlinkPerson(personId: string) {
    setLinkedPeopleIds((prev) => prev.filter((id) => id !== personId))
    const { error } = await supabase.from('meetings_people').delete().eq('meeting_id', meeting.id).eq('person_id', personId)
    if (error) {
      setLinkedPeopleIds((prev) => [...prev, personId])
      toast({ type: 'error', message: 'Failed to unlink person' })
    }
  }

  // ----- Status transitions -----

  async function startMeeting() {
    saveFieldImmediate({ status: 'in_meeting' })
  }

  async function closeMeeting() {
    saveFieldImmediate({ status: 'closed' })

    // Auto-trigger summary synthesis
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_hint: 'summary' }),
      })
      if (res.ok) {
        const json = await res.json()
        const version = json.version as DocumentVersion
        setDocContent(version.content)
        toast({ type: 'success', message: 'Meeting closed and summary generated' })
      }
    } catch {
      toast({ type: 'error', message: 'Meeting closed but summary generation failed' })
    }
  }

  // ----- Version / Synthesis handlers -----

  function handleSynthesizeComplete(version: DocumentVersion) {
    setDocContent(version.content)
    setViewingVersion(null)
  }

  function handleVersionSelect(content: string) {
    setViewingVersion({ content } as DocumentVersion)
  }

  const displayContent = viewingVersion ? viewingVersion.content : docContent
  const isClosed = meeting.status === 'closed' || meeting.status === 'ended'

  const linkedPeopleItems = linkedPeopleIds
    .map((id) => allPeople.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ id: p!.id, label: p!.name }))

  // Phase-specific config
  const synthesizeLabel = meeting.status === 'upcoming' ? 'Synthesize Prep Brief' : 'Synthesize Summary'
  const synthesizeHint = meeting.status === 'upcoming' ? 'prep' : 'summary'

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
          {isClosed ? (
            <h2 className="text-lg font-semibold px-0 truncate">{title}</h2>
          ) : (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => saveFieldImmediate({ title: e.target.value })}
              className="text-lg font-semibold border-none bg-transparent px-0 focus-visible:ring-0"
            />
          )}
        </div>

        <Badge
          variant="secondary"
          className={cn('shrink-0', STATUS_BADGE_CLASS[meeting.status])}
        >
          {STATUS_CONFIG[meeting.status].label}
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

      {/* Status bar + transition buttons */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-muted/30">
        <span className={cn('text-sm font-medium', STATUS_CONFIG[meeting.status].color)}>
          {STATUS_CONFIG[meeting.status].label}
        </span>
        {meeting.status === 'upcoming' && (
          <Button size="sm" onClick={startMeeting}>
            Start Meeting
          </Button>
        )}
        {meeting.status === 'in_meeting' && (
          <Button size="sm" onClick={closeMeeting}>
            Close Meeting
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
              {isClosed ? (
                <p className="text-sm">{date ? new Date(date + 'T00:00:00').toLocaleDateString() : 'No date'}</p>
              ) : (
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    saveFieldImmediate({ date: e.target.value || null })
                  }}
                  className="text-sm"
                />
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                Time
              </label>
              {isClosed ? (
                <p className="text-sm">{meetingTime || 'No time'}</p>
              ) : (
                <Input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => {
                    setMeetingTime(e.target.value)
                    saveFieldImmediate({ meeting_time: e.target.value || null })
                  }}
                  className="text-sm"
                />
              )}
            </div>
          </div>

          {/* Tags */}
          {!isClosed && (
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
          )}

          {/* Linked People */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                People
              </label>
              {!isClosed && (
                <LinkPicker
                  items={allPeople}
                  linkedIds={new Set(linkedPeopleIds)}
                  onLink={linkPerson}
                  placeholder="Link Person"
                />
              )}
            </div>
            {linkedPeopleItems.length > 0 ? (
              <div className="space-y-1">
                {linkedPeopleItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30 group"
                  >
                    <span className="text-sm truncate">{item.label}</span>
                    {!isClosed && (
                      <button
                        onClick={() => unlinkPerson(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">None linked</p>
            )}
          </div>

          {/* Past meetings with same people */}
          {pastMeetings.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Past Meetings
              </label>
              <div className="space-y-1">
                {pastMeetings.map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-sm"
                  >
                    <span className="truncate flex-1">{pm.title}</span>
                    {pm.scheduled_at && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(pm.scheduled_at + 'T00:00:00').toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Version History + Synthesize toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <VersionHistoryDropdown
              entityType="meeting"
              entityId={meeting.id}
              currentContent={docContent}
              onVersionSelect={handleVersionSelect}
            />
            {!isClosed && (
              <SynthesizeButton
                entityType="meetings"
                entityId={meeting.id}
                contextHint={synthesizeHint}
                label={synthesizeLabel}
                onComplete={handleSynthesizeComplete}
              />
            )}
          </div>

          {/* Document area */}
          <div>
            {meeting.status === 'upcoming' && (
              <>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Prep Brief
                </label>
                {viewingVersion ? (
                  <div className="min-h-[150px] rounded-md border border-border p-4">
                    <MarkdownRenderer content={displayContent} />
                  </div>
                ) : (
                  <RichTextEditor
                    value={displayContent}
                    onChange={(md) => setDocContent(md)}
                    onBlur={(md) => saveFieldImmediate({ prep_notes: md })}
                    placeholder="Meeting prep notes..."
                    minHeight="150px"
                  />
                )}
              </>
            )}

            {meeting.status === 'in_meeting' && (
              <>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Live Notes
                </label>
                {viewingVersion ? (
                  <div className="min-h-[300px] rounded-md border border-border p-4">
                    <MarkdownRenderer content={displayContent} />
                  </div>
                ) : (
                  <RichTextEditor
                    value={displayContent}
                    onChange={(md) => setDocContent(md)}
                    onBlur={(md) => saveFieldImmediate({ live_notes: md })}
                    placeholder="Type meeting notes..."
                    minHeight="300px"
                  />
                )}
              </>
            )}

            {isClosed && (
              <>
                <label className="text-xs text-muted-foreground font-medium mb-1 block">
                  Summary
                </label>
                <div className="min-h-[200px] rounded-md border border-border p-4 bg-muted/20">
                  <MarkdownRenderer content={displayContent} />
                  {!displayContent && (
                    <p className="text-sm text-muted-foreground">No summary generated yet.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Stream Panel */}
        <div className="border-t border-border px-4 py-4">
          <StreamPanel entityType="meeting" entityId={meeting.id} />
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
// Link picker (inline — same pattern as CRM)
// ---------------------------------------------------------------------------

function LinkPicker({
  items,
  linkedIds,
  onLink,
  placeholder,
}: {
  items: Person[]
  linkedIds: Set<string>
  onLink: (id: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const available = items.filter(
    (item) => !linkedIds.has(item.id) && !item.id.startsWith('temp-')
  )
  const filtered = available.filter((item) =>
    item.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} className="text-xs">
        <Link2 className="h-3 w-3 mr-1" />
        {placeholder}
      </Button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 w-64 rounded-md border border-border bg-card shadow-lg">
          <div className="p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="text-sm h-8"
              autoFocus
              onBlur={() => setTimeout(() => setOpen(false), 200)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No people available</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  className="w-full px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                  onMouseDown={() => { onLink(item.id); setOpen(false); setQuery('') }}
                >
                  {item.name}
                </button>
              ))
            )}
          </div>
        </div>
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
