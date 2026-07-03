/**
 * Base error for failed Monospace REST requests.
 */
export class MonospaceRestError extends Error {
  /**
   * HTTP status code returned by Monospace.
   */
  status: number

  /**
   * Optional structured error details returned by Monospace.
   */
  meta?: Record<string, unknown>

  /**
   * Creates a Monospace REST error.
   */
  constructor(message: string, status: number, meta?: Record<string, unknown>) {
    super(message)
    this.name = 'MonospaceRestError'
    this.status = status
    this.meta = meta
  }
}

/**
 * Error returned for invalid Monospace mutation or query payloads.
 */
export class MonospaceValidationError extends MonospaceRestError {
  /**
   * Creates a Monospace validation error.
   */
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 400, meta)
    this.name = 'MonospaceValidationError'
  }
}

/**
 * Error returned when Monospace authentication fails.
 */
export class MonospaceAuthError extends MonospaceRestError {
  /**
   * Creates a Monospace authentication error.
   */
  constructor(message = 'Authentication failed', meta?: Record<string, unknown>) {
    super(message, 401, meta)
    this.name = 'MonospaceAuthError'
  }
}

/**
 * Error returned when Monospace denies access to a resource.
 */
export class MonospacePermissionError extends MonospaceRestError {
  /**
   * Creates a Monospace permission error.
   */
  constructor(message = 'Permission denied', meta?: Record<string, unknown>) {
    super(message, 403, meta)
    this.name = 'MonospacePermissionError'
  }
}

/**
 * Error returned when a Monospace item cannot be found.
 */
export class MonospaceNotFoundError extends MonospaceRestError {
  /**
   * Collection that was being read or mutated.
   */
  collection?: string

  /**
   * Item key that was being read or mutated.
   */
  key?: unknown

  /**
   * Creates a Monospace not-found error.
   */
  constructor(message = 'Item not found', collection?: string, key?: unknown, meta?: Record<string, unknown>) {
    super(message, 404, meta)
    this.name = 'MonospaceNotFoundError'
    this.collection = collection
    this.key = key
  }
}

/**
 * Maps an HTTP response body to a typed Monospace error.
 */
export function createMonospaceError(
  status: number,
  body: unknown,
  context: {
    /**
     * Collection involved in the failed request.
     */
    collection?: string

    /**
     * Item key involved in the failed request.
     */
    key?: unknown
  } = {},
): MonospaceRestError {
  const payload = isErrorPayload(body) ? body : undefined
  const message = payload?.message ?? `Monospace request failed with status ${status}`
  const meta = payload?.meta

  switch (status) {
    case 400:
      return new MonospaceValidationError(message, meta)
    case 401:
      return new MonospaceAuthError(message, meta)
    case 403:
      return new MonospacePermissionError(message, meta)
    case 404:
      return new MonospaceNotFoundError(message, context.collection, context.key, meta)
    default:
      return new MonospaceRestError(message, status, meta)
  }
}

/**
 * Returns whether a response body contains a Monospace error payload.
 */
function isErrorPayload(value: unknown): value is {
  /**
   * Human-readable error message.
   */
  message: string

  /**
   * Optional structured error details.
   */
  meta?: Record<string, unknown>
} {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof (value as { message?: unknown }).message === 'string'
}
