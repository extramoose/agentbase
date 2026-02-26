import { requireAdmin } from '@/lib/auth'
import { UsersClient } from './users-client'

export default async function AdminUsersPage() {
  const profile = await requireAdmin()
  return <UsersClient currentUserId={profile.id} />
}
