export class ApiError extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number = 400,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401)
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403)
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(message, 404)
  }
}

export class RateLimitError extends ApiError {
  constructor(public readonly retryAfter: number) {
    super('Rate limit exceeded', 429)
  }
}

export function apiResponse(data: unknown, status = 200): Response {
  return Response.json({ success: true, data }, { status })
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = {}
    if (error instanceof RateLimitError) {
      headers['Retry-After'] = String(error.retryAfter)
    }
    return Response.json(
      { success: false, error: error.message },
      { status: error.status, headers }
    )
  }
  if (error instanceof Error) {
    console.error('Unhandled API error:', error)
    return Response.json({ success: false, error: error.message }, { status: 500 })
  }
  // Supabase PostgrestError is a plain object with { message, code, details, hint }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as Record<string, unknown>).message)
    const code = 'code' in error ? String((error as Record<string, unknown>).code) : undefined
    console.error('Unhandled Supabase error:', error)
    return Response.json(
      { success: false, error: msg, code },
      { status: 500 }
    )
  }
  console.error('Unhandled API error (unknown type):', error)
  return Response.json({ success: false, error: 'Unknown error' }, { status: 500 })
}
