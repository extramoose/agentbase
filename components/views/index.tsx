'use client'

import { TimeframeView } from './timeframe-view'
import { StatusView } from './status-view'
import { ExperimentA } from './experiment-a'
import type { WorkspaceMember } from '@/hooks/use-task-filters'
import { ExperimentB } from './experiment-b'
import { ExperimentC } from './experiment-c'
import { PersonalBoard } from './personal-board'

export type ViewType = 'sticky-timeframe' | 'sticky-status' | 'experiment-a' | 'experiment-b' | 'experiment-c' | 'personal-board'

type Task = Parameters<typeof TimeframeView>[0]['tasks'][number]

export interface ViewRendererProps {
  workspaceMembers?: WorkspaceMember[]
  view: ViewType
  tasks: Task[]
  taskHref: (task: Task) => string
  recentlyChanged?: Set<string>
}

export function ViewRenderer({ view, tasks, taskHref, recentlyChanged, workspaceMembers = [] }: ViewRendererProps) {
  switch (view) {
    case 'sticky-timeframe':
      return <TimeframeView tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'sticky-status':
      return <StatusView tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'experiment-a':
      return <ExperimentA tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} workspaceMembers={workspaceMembers} />
    case 'experiment-b':
      return <ExperimentB />
    case 'experiment-c':
      return <ExperimentC tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
    case 'personal-board':
      return <PersonalBoard tasks={tasks} taskHref={taskHref} recentlyChanged={recentlyChanged} />
  }
}
