import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { InviteClient } from './invite-client'

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ email?: string }>
}) {
  const { token } = await params
  const { email } = await searchParams
  const user = await getCurrentUser()

  if (!user) {
    const emailParam = email ? `&invite_email=${encodeURIComponent(email)}` : ''
    redirect(`/sign-in?invite_token=${token}${emailParam}`)
  }

  return <InviteClient token={token} />
}
