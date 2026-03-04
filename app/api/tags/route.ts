import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('tasks')
    .select('tags')
    .not('tags', 'is', null)

  if (error) return NextResponse.json({ tags: [] })

  // Count frequency
  const freq: Record<string, number> = {}
  for (const row of rows ?? []) {
    for (const tag of row.tags ?? []) {
      freq[tag] = (freq[tag] ?? 0) + 1
    }
  }

  const tags = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  return NextResponse.json({ tags })
}
