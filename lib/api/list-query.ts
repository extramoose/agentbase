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

/**
 * Parse optional filter params from the request URL.
 * Returns a map of field→value (raw string, may be comma-separated for multi-value).
 */
export function parseFilterParams(request: Request, fields: string[]): Record<string, string> {
  const url = new URL(request.url)
  const filters: Record<string, string> = {}
  for (const f of fields) {
    const v = url.searchParams.get(f)
    if (v) filters[f] = v
  }
  return filters
}

/**
 * Apply field-exact filters to a Supabase query.
 * Single values use .eq(), comma-separated values use .in().
 */
export function applyFilters<T>(
  query: T,
  filters: Record<string, string>,
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  for (const [field, value] of Object.entries(filters)) {
    const values = value.split(',').map(v => v.trim()).filter(Boolean)
    if (values.length === 1) {
      q = q.eq(field, values[0])
    } else if (values.length > 1) {
      q = q.in(field, values)
    }
  }
  return q as T
}

/**
 * Filter an array of records in-memory by exact field matches.
 * Supports comma-separated multi-value params.
 */
export function filterByFieldsInMemory<R extends Record<string, unknown>>(
  records: R[],
  filters: Record<string, string>,
): R[] {
  let result = records
  for (const [field, value] of Object.entries(filters)) {
    const values = value.split(',').map(v => v.trim()).filter(Boolean)
    result = result.filter(r => {
      const fieldVal = r[field]
      if (fieldVal == null) return false
      return values.includes(String(fieldVal))
    })
  }
  return result
}
