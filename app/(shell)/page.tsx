import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  CheckSquare, BookOpen, Users, Clock
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
  ] = await Promise.all([
    supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('library_items').select('*', { count: 'exact', head: true }),
  ])

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const greeting = getGreeting()
  const name = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold">{greeting}, {name}</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s your workspace at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <StatCard label="Tasks in progress" value={taskCount ?? 0} href="/tools/tasks" />
        <StatCard label="Library items" value={libraryCount ?? 0} href="/tools/library" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          return (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-accent/10 transition-all"
            >
              <Icon className="h-5 w-5 text-muted-foreground mb-3 group-hover:text-primary transition-colors" />
              <p className="font-medium text-sm">{tool.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{tool.desc}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors block">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </Link>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
