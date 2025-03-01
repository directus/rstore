import type { FindOptions, ResolvedModelType } from '@rstore/shared'

export function defaultMarker(type: ResolvedModelType<any, any, any>, findOptions?: FindOptions<any, any, any>) {
  return `${type.name}:${JSON.stringify(findOptions ?? {})}:${typeof findOptions?.filter !== 'function' ? JSON.stringify(findOptions?.filter ?? {}) : '{}'}`
}

export function getMarker(kind: 'first' | 'many', marker: string) {
  return `${kind}:${marker}`
}
