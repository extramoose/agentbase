'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { Bot } from 'lucide-react'

type Agent = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  owner_name: string
}

interface AgentsClientProps {
  agents: Agent[]
}

export function AgentsClient({ agents }: AgentsClientProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Agents</h1>

      <div className="rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted-foreground">
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => {
              const displayName = agent.full_name ?? agent.email.split('@')[0]
              const initials = displayName.slice(0, 2).toUpperCase()

              return (
                <tr key={agent.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={agent.avatar_url ?? undefined} alt={displayName} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          <Badge variant="secondary" className="bg-violet-500/20 text-violet-400">
                            <Bot className="h-3 w-3 mr-1" />
                            Agent
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{agent.owner_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(agent.created_at), { addSuffix: true })}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {agents.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No agents configured.</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Coming soon: create and manage agents from this page.
      </p>
    </div>
  )
}
