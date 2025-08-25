import type { FindOptions, ResolvedModel } from '@rstore/shared'

export function defaultMarker(model: ResolvedModel, findOptions?: FindOptions<any, any, any>) {
  return `${model.name}:${JSON.stringify(findOptions ?? {})}:${typeof findOptions?.filter !== 'function' ? JSON.stringify(findOptions?.filter ?? {}) : '{}'}`
}

export function getMarker(kind: 'first' | 'many', marker: string) {
  return `${kind}:${marker}`
}
