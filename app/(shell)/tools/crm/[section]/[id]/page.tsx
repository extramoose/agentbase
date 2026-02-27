import { redirect } from 'next/navigation'

export default async function CrmDetailPage({
  params,
}: {
  params: Promise<{ section: string; id: string }>
}) {
  const { section, id } = await params
  redirect(`/tools/crm/${section}?id=${id}`)
}
