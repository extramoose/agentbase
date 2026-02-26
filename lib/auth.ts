import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return profile
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return session
}

export async function requireAdmin() {
  const profile = await getUserProfile()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    redirect('/')
  }
  return profile
}
