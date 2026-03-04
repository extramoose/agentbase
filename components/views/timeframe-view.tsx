'use client'

import { StickiesView } from '@/components/stickies-view'

type Task = Parameters<typeof StickiesView>[0]['tasks'][number]

interface TimeframeViewProps {
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

export function TimeframeView({ tasks, taskHref, recentlyChanged }: TimeframeViewProps) {
  return (
    <div className="p-4">
      <StickiesView
        tasks={tasks}
        taskHref={taskHref}
        mode="timeframe"
        recentlyChanged={recentlyChanged}
      />
    </div>
  )
}
