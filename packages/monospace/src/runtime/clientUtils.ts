import type { MonospaceQueryOptions } from './query'
import { MonospaceValidationError } from './errors'
import { serializeMonospaceQuery } from './query'

/**
 * Item key accepted by the Monospace REST client.
 *
 * Scalar keys address the `/items/{collection}/{key}` item route. Object keys
 * map key column names to values and address the item through a filtered
 * collection request instead, as required for composite primary keys and
 * for collections without item routes.
 */
export type MonospaceItemKey = string | number | Record<string, string | number>

/**
 * Returns whether an item key carries key column values instead of a scalar
 * route key.
 */
export function isMonospaceKeyObject(key: MonospaceItemKey | undefined): key is Record<string, string | number> {
  return typeof key === 'object' && key !== null
}

/**
 * Adds the equality filter matching an object item key to a query.
 *
 * An existing query filter is preserved through an `_and` group so it can
 * never widen the key match.
 */
export function withMonospaceKeyFilter(
  query: MonospaceQueryOptions | undefined,
  key: Record<string, string | number>,
): MonospaceQueryOptions & { filter: Record<string, any> } {
  const keyFilter = Object.fromEntries(Object.entries(key).map(([column, value]) => [column, { _eq: value }]))
  return {
    ...query,
    filter: query?.filter ? { _and: [query.filter, keyFilter] } : keyFilter,
  }
}

/**
 * Asserts that a bulk mutation cannot serialize to an unfiltered REST request.
 */
export function assertBulkMutationFilter(query: MonospaceQueryOptions | undefined): void {
  const filterQuery = serializeMonospaceQuery({ filter: query?.filter }).toString()
  if (!filterQuery) {
    throw new MonospaceValidationError('Monospace bulk mutations require a non-empty filter')
  }
}

/**
 * Creates a Monospace collection or item endpoint URL.
 */
export function createItemUrl(
  baseUrl: string,
  collection: string,
  key: string | number | undefined,
  query: MonospaceQueryOptions | undefined,
): string {
  const itemPath = key == null ? '' : `/${encodeURIComponent(String(key))}`
  const url = `${baseUrl}/items/${encodeURIComponent(collection)}${itemPath}`
  const search = serializeMonospaceQuery(query).toString()
  return search ? `${url}?${search}` : url
}

/**
 * Removes one trailing slash from a URL.
 */
export function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * Reads a REST response body as JSON when possible.
 */
export async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }
  const text = await response.text()
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/**
 * Unwraps a Monospace `{ data }` envelope when one is returned.
 */
export function unwrapEnvelope(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data
  }
  return value
}

/**
 * Returns the first item of a filtered collection response, or `null`.
 */
export function firstItem(value: unknown): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}
