'use client'

import { useRouter } from 'next/navigation'
import { EntityShelf } from '@/components/entity-client/entity-shelf'
import { TaskShelfContent, type Task } from '@/app/(shell)/tasks/tasks-client'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export function TaskShelfOverlay({ task }: { task: Task }) {
  const router = useRouter()

  const handleClose = () => {
    router.back()
  }

  return (
    <EntityShelf
      entity={task}
      entityType="task"
      onClose={handleClose}
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!window.confirm('Delete this task? This cannot be undone.')) return
            try {
              const res = await fetch('/api/commands/delete-entity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'tasks', id: task.id }),
              })
              if (!res.ok) {
                const json = await res.json()
                throw new Error(json.error ?? 'Delete failed')
              }
              handleClose()
            } catch (err) {
              toast({
                type: 'error',
                message: err instanceof Error ? err.message : 'Delete failed',
              })
            }
          }}
          className="text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete task
        </Button>
      }
    >
      <TaskShelfContent task={task} />
    </EntityShelf>
  )
}
