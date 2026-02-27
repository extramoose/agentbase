export interface ListParams {
  page: number    // 1-based, default 1
  limit: number   // default 50, max 200
  q: string       // search query, default ''
}

export function parseListParams(request: Request): ListParams {
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))
  const q = (url.searchParams.get('q') ?? '').trim()
  return { page, limit, q }
}

/** Apply ILIKE search to a Supabase query on one or more text columns */
export function applySearch<T>(
  query: T,
  q: string,
  columns: string[],
): T {
  if (!q || columns.length === 0) return query
  // Supabase .or() with ilike: "title.ilike.%foo%,name.ilike.%foo%"
  const filter = columns.map(col => `${col}.ilike.%${q}%`).join(',')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).or(filter) as T
}

/** Apply pagination to a Supabase query */
export function applyPagination<T>(query: T, page: number, limit: number): T {
  const from = (page - 1) * limit
  const to = from + limit - 1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (query as any).range(from, to) as T
}

/** Filter an array of records in-memory with a search string across given keys */
export function filterInMemory<R extends Record<string, unknown>>(
  records: R[],
  q: string,
  keys: (keyof R)[],
): R[] {
  if (!q) return records
  const lower = q.toLowerCase()
  return records.filter(r =>
    keys.some(k => typeof r[k] === 'string' && (r[k] as string).toLowerCase().includes(lower))
  )
}

/** Paginate an array in-memory */
export function paginateInMemory<R>(records: R[], page: number, limit: number): R[] {
  const from = (page - 1) * limit
  return records.slice(from, from + limit)
}
