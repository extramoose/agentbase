import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // YYYY-MM-DD in user's timezone
  const tz = searchParams.get('tz') ?? 'UTC'

  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('rpc_history_day_stats', {
    p_date: date,
    p_tz: tz,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? { created: 0, completed: 0, comments: 0, updates: 0, total: 0 })
}
