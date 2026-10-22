import type { InspectionContext } from './context'

/** Normalize cache-owned lazy tombstones within scan allowance before projection. */
export function readCacheMetadata(source: unknown, context: InspectionContext) {
  if (!source || typeof source !== 'object')
    return context.project(source)
  const tombstones = Object.getOwnPropertyDescriptor(source, 'tombstones')?.value
  const iterator = tombstones && Object.getOwnPropertyDescriptor(tombstones, Symbol.iterator)?.value
  if (typeof iterator !== 'function')
    return context.project(source)
  const copy = Object.create(null)
  const keys = Reflect.ownKeys(source)
  for (const key of keys.slice(0, 1000)) {
    if (key !== 'tombstones') {
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (descriptor)
        Object.defineProperty(copy, key, descriptor)
    }
  }
  if (keys.length > 1000)
    context.markTruncated()
  const records: unknown[] = []
  // This iterator is a public cache diagnostic capability, never a store
  // module function or arbitrary application action.
  for (const record of tombstones as Iterable<unknown>) {
    if (records.length >= 1000) {
      context.markTruncated()
      break
    }
    records.push(record)
  }
  Object.defineProperty(copy, 'tombstones', { value: records, enumerable: true })
  return context.project(copy)
}
