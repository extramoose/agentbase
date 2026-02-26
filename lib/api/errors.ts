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
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error('Unhandled API error:', error)
  return Response.json({ success: false, error: message }, { status: 500 })
}
