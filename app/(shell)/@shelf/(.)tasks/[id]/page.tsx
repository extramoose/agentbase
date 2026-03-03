import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TaskShelfOverlay } from './task-shelf-overlay'

export default async function InterceptedTaskShelfPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(id)

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq(isNumeric ? 'ticket_id' : 'id', isNumeric ? Number(id) : id)
    .single()

  if (!task) notFound()

  return <TaskShelfOverlay task={task} />
}
