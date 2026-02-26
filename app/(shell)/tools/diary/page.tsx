import { redirect } from 'next/navigation'

export default function DiaryPage() {
  const today = new Date()
    .toLocaleString('en-CA', { timeZone: 'America/Denver' })
    .split(',')[0]
  redirect(`/tools/diary/${today}`)
}
