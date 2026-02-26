'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { Settings } from 'lucide-react'

interface SettingsClientProps {
  workspaceName: string
  supabaseProjectId: string
}

export function SettingsClient({ workspaceName, supabaseProjectId }: SettingsClientProps) {
  const [llmModel, setLlmModel] = useState('')

  function handleSave() {
    toast({ type: 'success', message: 'Settings saved' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="max-w-lg space-y-6">
        <div className="space-y-2">
          <Label htmlFor="workspace-name">Workspace Name</Label>
          <Input
            id="workspace-name"
            value={workspaceName}
            readOnly
            className="bg-muted/40 cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground">Read-only. Managed via database.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="supabase-project">Supabase Project ID</Label>
          <Input
            id="supabase-project"
            value={supabaseProjectId}
            readOnly
            className="bg-muted/40 cursor-not-allowed font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Read-only. Derived from environment.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Default LLM Model</Label>
          <Input
            id="llm-model"
            value={llmModel}
            onChange={e => setLlmModel(e.target.value)}
            placeholder="e.g. claude-sonnet-4-6"
          />
          <p className="text-xs text-muted-foreground">
            No live effect yet — placeholder for future configuration.
          </p>
        </div>

        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  )
}
