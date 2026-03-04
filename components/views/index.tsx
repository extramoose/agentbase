'use client'

import { TimeframeView } from './timeframe-view'
import { StatusView } from './status-view'
import { ExperimentA } from './experiment-a'
import { ExperimentB } from './experiment-b'

export type ViewType = 'sticky-timeframe' | 'sticky-status' | 'experiment-a' | 'experiment-b'

type Task = Parameters<typeof TimeframeView>[0]['tasks'][number]

export interface ViewRendererProps {
  view: ViewType
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

export function ViewRenderer({ view, tasks, taskHref, recentlyChanged }: ViewRendererProps) {
  switch (view) {
    case 'sticky-timeframe':
      return <TimeframeView tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'sticky-status':
      return <StatusView tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'experiment-a':
      return <ExperimentA tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'experiment-b':
      return <ExperimentB />
  }
}
