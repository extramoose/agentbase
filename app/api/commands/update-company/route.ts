import { PATCH as genericPatch } from '../update/route'

export async function POST(request: Request) {
  const body = await request.json()
  const wrapped = new Request(request.url, {
    method: 'PATCH',
    headers: request.headers,
    body: JSON.stringify({ table: 'companies', ...body }),
  })
  return genericPatch(wrapped)
}
