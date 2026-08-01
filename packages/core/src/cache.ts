import type { FindOptions, ResolvedCollection } from '@rstore/shared'
import { stringifyFindOptions } from './utils/findOptions'

/**
 * Compute the default cache marker for a query. Markers record which queries
 * were already fetched into the cache. Function-valued options (e.g. a
 * `filter` function) are serialized with a per-process unique id so two
 * queries with different functions never share a marker.
 */
export function defaultMarker(collection: ResolvedCollection, findOptions?: FindOptions<any, any, any>) {
  // Exclude fetchOptions (refresh behavior) as it doesn't affect the query result
  const { fetchOptions, ...markerOptions } = findOptions ?? {}
  return `${collection.name}:${stringifyFindOptions(markerOptions)}`
}

/**
 * Prefix a marker with the kind of query (`first` or `many`) it belongs to.
 */
export function getMarker(kind: 'first' | 'many', marker: string) {
  return `${kind}:${marker}`
}
