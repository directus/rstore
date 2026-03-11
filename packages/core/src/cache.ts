import type { FindOptions, ResolvedCollection } from '@rstore/shared'

export function defaultMarker(collection: ResolvedCollection, findOptions?: FindOptions<any, any, any>) {
  const { fetchOptions, ...markerOptions } = findOptions ?? {}
  return `${collection.name}:${JSON.stringify(markerOptions)}:${typeof findOptions?.filter !== 'function' ? JSON.stringify(findOptions?.filter ?? {}) : '{}'}`
}

export function getMarker(kind: 'first' | 'many', marker: string) {
  return `${kind}:${marker}`
}
