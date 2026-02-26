import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { UnauthorizedError, ForbiddenError } from '@/lib/api/errors'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: 'superadmin' | 'admin' | 'user'
  created_at: string
  updated_at: string
}

export async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return profile as UserProfile | null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  return user
}

export async function requireAdmin(): Promise<UserProfile> {
  const profile = await getUserProfile()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    redirect('/')
  }
  return profile
}

/** For API routes — throws UnauthorizedError (caught by apiError) */
export async function requireAuthApi() {
  const user = await getCurrentUser()
  if (!user) throw new UnauthorizedError()
  return user
}

/** For API routes — throws ForbiddenError (caught by apiError) */
export async function requireAdminApi(): Promise<UserProfile> {
  const profile = await getUserProfile()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new ForbiddenError()
  }
  return profile
}
