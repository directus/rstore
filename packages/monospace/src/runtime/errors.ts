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
 * One license limit violation reported by Monospace.
 */
export interface MonospaceLicenseViolation {
  /**
   * Licensed entitlement, for example `seats` or `custom_roles`.
   */
  entitlement: string

  /**
   * Usage the operation would produce (`true` for on/off entitlements).
   */
  usage?: number | boolean

  /**
   * Hard limit of numeric entitlements.
   */
  hard_limit?: number

  /**
   * Whether on/off entitlements are allowed (`false` when violated).
   */
  allowed?: boolean

  /**
   * Unknown extra violation properties.
   */
  [key: string]: unknown
}

/**
 * Error returned when an operation would exceed a license limit (codes
 * `6001`–`6008`) or when the instance license is locked (no code).
 */
export class MonospaceLicenseError extends MonospaceRestError {
  /**
   * License limit violations from `meta.violations`, empty when Monospace
   * sends none (locked license, audit logs code `6008`).
   */
  violations: MonospaceLicenseViolation[]

  /**
   * Creates a Monospace license error.
   */
  constructor(message = 'License limit exceeded', details?: MonospaceErrorDetails) {
    super(message, 402, details)
    this.name = 'MonospaceLicenseError'
    const violations = details?.meta?.violations
    this.violations = Array.isArray(violations) ? violations as MonospaceLicenseViolation[] : []
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
  const message = payload ? describeErrorChain(payload) : `Monospace request failed with status ${status}`
  const details: MonospaceErrorDetails = {
    code: payload ? findDeepestCode(payload) : undefined,
    meta: payload?.meta,
    source: payload?.source,
  }

  switch (status) {
    case 400:
    case 422:
      return new MonospaceValidationError(message, details, status)
    case 401:
      return new MonospaceAuthError(message, details)
    case 402:
      return new MonospaceLicenseError(message, details)
    case 403:
      return new MonospacePermissionError(message, details)
    case 404:
      return new MonospaceNotFoundError(message, context.collection, context.key, details)
    default:
      return new MonospaceRestError(message, status, details)
  }
}

/**
 * Monospace `EngineError` payload: top-level messages are often generic
 * ("Failed to execute query") and the specific cause lives in the
 * recursive `source` chain.
 */
interface MonospaceErrorPayload {
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
}

/**
 * Returns the error chain from the outer payload down to the root cause,
 * following `source` while it is a valid error payload.
 */
function getErrorChain(payload: MonospaceErrorPayload): MonospaceErrorPayload[] {
  const chain = [payload]
  let current: unknown = payload.source
  // Bounded walk guards against pathological (cyclic) source objects.
  while (isErrorPayload(current) && chain.length < 32) {
    chain.push(current)
    current = current.source
  }
  return chain
}

/**
 * Builds the error message as `outer: root cause` so the specific cause
 * behind a generic top-level message is visible.
 */
function describeErrorChain(payload: MonospaceErrorPayload): string {
  const root = getErrorChain(payload).at(-1)!
  return root === payload || root.message === payload.message
    ? payload.message
    : `${payload.message}: ${root.message}`
}

/**
 * Returns the code of the deepest error in the chain that has one.
 */
function findDeepestCode(payload: MonospaceErrorPayload): string | undefined {
  return getErrorChain(payload).reverse().find(item => item.code != null)?.code
}

/**
 * Returns whether a value is a Monospace error payload.
 */
function isErrorPayload(value: unknown): value is MonospaceErrorPayload {
  return typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof (value as { message?: unknown }).message === 'string'
}
