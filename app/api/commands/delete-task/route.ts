import { POST as genericDelete } from '../delete-entity/route'

export async function POST(request: Request) {
  const body = await request.json()
  const wrapped = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ table: 'tasks', ...body }),
  })
  return genericDelete(wrapped)
}
