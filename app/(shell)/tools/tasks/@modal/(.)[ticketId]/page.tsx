import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TaskModal } from './task-modal'

export default async function InterceptedTaskPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params
  await requireAuth()
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(ticketId)
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq(isNumeric ? 'ticket_id' : 'id', isNumeric ? Number(ticketId) : ticketId)
    .single()

  if (!task) notFound()

  return <TaskModal task={task} />
}
