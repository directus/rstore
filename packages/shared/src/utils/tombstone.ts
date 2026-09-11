import type { CacheTombstone } from '../types/cache.js'

/** Return whether a value is a serializable cache tombstone record. */
export function isCacheTombstone(value: unknown): value is CacheTombstone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const tombstone = value as Partial<CacheTombstone>
  return typeof tombstone.collection === 'string'
    && (typeof tombstone.key === 'string' || typeof tombstone.key === 'number')
    && (typeof tombstone.deletedAt === 'string' || typeof tombstone.deletedAt === 'number')
}
