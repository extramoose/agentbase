import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { InviteClient } from './invite-client'

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const user = await getCurrentUser()

  if (!user) {
    redirect(`/sign-in?invite_token=${token}`)
  }

  return <InviteClient token={token} />
}
