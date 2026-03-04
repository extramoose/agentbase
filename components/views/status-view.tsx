'use client'

import { StickiesView } from '@/components/stickies-view'

type Task = Parameters<typeof StickiesView>[0]['tasks'][number]

interface StatusViewProps {
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

export function StatusView({ tasks, taskHref, recentlyChanged }: StatusViewProps) {
  return (
    <StickiesView
      tasks={tasks}
      taskHref={taskHref}
      mode="status"
      recentlyChanged={recentlyChanged}
    />
  )
}
