import { createError } from 'h3'
import SuperJSON from 'superjson'

/**
 * Parses the `superjson` query parameter carrying the search query of a read route.
 *
 * The parameter is client-controlled and therefore optional in practice: a
 * direct browser hit or a probe reaches the route with no query string at all.
 * Such a request must behave like an empty search query so the route's
 * `before` hooks (auth, permissions) decide the response, instead of crashing
 * with a `SyntaxError` before they run. Anything present but unparsable is a
 * client mistake and is reported as `400`.
 *
 * @param rawSuperjson The raw `superjson` value read from the request query.
 * @returns The parsed search query, or an empty object when the param is absent.
 */
export function parseSearchQuery<T extends object>(rawSuperjson: unknown): T {
  if (rawSuperjson == null || rawSuperjson === '') {
    return {} as T
  }

  // `getQuery` yields an array when the param is repeated in the query string.
  if (typeof rawSuperjson !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid superjson query parameter' })
  }

  let parsed: unknown
  try {
    parsed = SuperJSON.parse(rawSuperjson)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid superjson query parameter' })
  }

  if (parsed == null) {
    return {} as T
  }

  // Downstream code reads `searchQuery.<field>`, so anything but a plain object
  // is a malformed query rather than a query that happens to select nothing.
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid superjson query parameter' })
  }

  return parsed as T
}
