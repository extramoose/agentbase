import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  CheckSquare, BookOpen, Users, Clock, UserCircle
} from 'lucide-react'

const TOOLS = [
  { href: '/tools/tasks',    label: 'Tasks',    icon: CheckSquare, desc: 'Manage your work queue' },
  { href: '/tools/library',  label: 'Library',  icon: BookOpen,    desc: 'Save links, notes & ideas' },
  { href: '/tools/crm',      label: 'CRM',      icon: Users,       desc: 'Companies, people & deals' },
  { href: '/history',        label: 'History',  icon: Clock,       desc: 'All recent activity' },
]

export default async function HomePage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const [
    { count: taskCount },
    { count: libraryCount },
    { count: crmCount },
    { count: doneToday },
  ] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('library_items').select('*', { count: 'exact', head: true }),
    supabase.from('people').select('*', { count: 'exact', head: true }),
    supabase.from('tasks').select('*', { count: 'exact', head: true })
      .eq('status', 'done')
      .gte('updated_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ])

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const greeting = getGreeting()
  const name = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{greeting}, {name}</h1>
        <p className="text-muted-foreground mt-1 text-sm">Here&apos;s your workspace at a glance.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="In progress" value={taskCount ?? 0} href="/tools/tasks?status=in_progress" icon={CheckSquare} />
        <StatCard label="Done today" value={doneToday ?? 0} href="/tools/tasks?status=done" icon={CheckSquare} accent />
        <StatCard label="Contacts" value={crmCount ?? 0} href="/tools/crm" icon={UserCircle} />
        <StatCard label="Library" value={libraryCount ?? 0} href="/tools/library" icon={BookOpen} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-xl border border-border bg-card p-4 hover:border-foreground/20 hover:bg-muted/30 transition-all"
            >
              <Icon className="h-4 w-4 text-muted-foreground mb-2 group-hover:text-foreground transition-colors" />
              <p className="font-medium text-sm">{tool.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tool.desc}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, href, icon: Icon, accent }: { label: string; value: number; href: string; icon: React.ElementType; accent?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 hover:border-foreground/20 transition-colors block group">
      <div className="flex items-center justify-between mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${accent ? 'text-green-500' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Link>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
