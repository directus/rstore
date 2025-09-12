import type { FindOptions, ResolvedCollection } from '@rstore/shared'

export function defaultMarker(collection: ResolvedCollection, findOptions?: FindOptions<any, any, any>) {
  return `${collection.name}:${JSON.stringify(findOptions ?? {})}:${typeof findOptions?.filter !== 'function' ? JSON.stringify(findOptions?.filter ?? {}) : '{}'}`
}

export function getMarker(kind: 'first' | 'many', marker: string) {
  return `${kind}:${marker}`
}
