/**
 * Structured details carried by Monospace error payloads.
 */
export interface MonospaceErrorDetails {
  /**
   * Monospace error code.
   */
  code?: string

  /**
   * Optional structured error details returned by Monospace.
   */
  meta?: Record<string, unknown>

  /**
   * Nested error that caused this error.
   */
  source?: unknown
}

/**
 * Base error for failed Monospace REST requests.
 */
export class MonospaceRestError extends Error {
  /**
   * HTTP status code returned by Monospace.
   */
  status: number

  /**
   * Monospace error code.
   */
  code?: string

  /**
   * Optional structured error details returned by Monospace.
   */
  meta?: Record<string, unknown>

  /**
   * Nested error that caused this error.
   */
  source?: unknown

  /**
   * Creates a Monospace REST error.
   */
  constructor(message: string, status: number, details?: MonospaceErrorDetails) {
    super(message)
    this.name = 'MonospaceRestError'
    this.status = status
    this.code = details?.code
    this.meta = details?.meta
    this.source = details?.source
  }
}

/**
 * Error returned for invalid Monospace mutation or query payloads.
 */
export class MonospaceValidationError extends MonospaceRestError {
  /**
   * Creates a Monospace validation error. Monospace responds with 400 for
   * invalid payloads and 422 for invalid REST queries.
   */
  constructor(message: string, details?: MonospaceErrorDetails, status: number = 400) {
    super(message, status, details)
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
  constructor(message = 'Authentication failed', details?: MonospaceErrorDetails) {
    super(message, 401, details)
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
  constructor(message = 'Permission denied', details?: MonospaceErrorDetails) {
    super(message, 403, details)
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
  constructor(message = 'Item not found', collection?: string, key?: unknown, details?: MonospaceErrorDetails) {
    super(message, 404, details)
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
  const details: MonospaceErrorDetails = {
    code: payload?.code,
    meta: payload?.meta,
    source: payload?.source,
  }

  switch (status) {
    case 400:
    case 422:
      return new MonospaceValidationError(message, details, status)
    case 401:
      return new MonospaceAuthError(message, details)
    case 403:
      return new MonospacePermissionError(message, details)
    case 404:
      return new MonospaceNotFoundError(message, context.collection, context.key, details)
    default:
      return new MonospaceRestError(message, status, details)
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
   * Monospace error code.
   */
  code?: string

  /**
   * Optional structured error details.
   */
  meta?: Record<string, unknown>

  /**
   * Nested error that caused this error.
   */
  source?: unknown
} {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof (value as { message?: unknown }).message === 'string'
}
