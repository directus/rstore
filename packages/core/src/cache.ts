import type { FindOptions, ResolvedModelType } from '@rstore/shared'

export function defaultManyMarker(type: ResolvedModelType<any, any>, findOptions?: FindOptions<any, any, any>) {
  return `many:${type.name}:${JSON.stringify(findOptions ?? {})}:${typeof findOptions?.filter !== 'function' ? JSON.stringify(findOptions?.filter ?? {}) : '{}'}`
}
