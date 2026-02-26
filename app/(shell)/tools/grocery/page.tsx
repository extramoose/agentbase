import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { GroceryClient } from './grocery-client'

export default async function GroceryPage() {
  await requireAuth()
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('grocery_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  return <GroceryClient initialItems={items ?? []} />
}
