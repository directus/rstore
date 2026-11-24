import type { CacheScope, FieldTimestampValue } from '@rstore/shared'

/** Opt-in metadata on list requests and responses. */
export const queryCacheHeader = 'x-rstore-query-cache'

/** Cache assertions issued by the server for one list response. */
export interface DrizzleQueryCacheMetadata {
  /** Exact scope approved by an authoritative server handler. */
  completeScope?: CacheScope
  /** Comparable scope snapshot revision supplied by the application. */
  revision?: FieldTimestampValue
  /** Membership and order can be evaluated locally for approved creates. */
  localCreatePlacement?: boolean
}

/** Accept only a plain single-field equality recognized by the connector. */
export function exactCacheScope(where: unknown): CacheScope | undefined {
  if (where == null || typeof where !== 'object' || !('operator' in where) || where.operator !== 'eq'
    || !('field' in where) || typeof where.field !== 'string'
    || !('value' in where) || (typeof where.value !== 'string' && (typeof where.value !== 'number' || !Number.isFinite(where.value)))) {
    return
  }
  return { field: where.field, value: where.value }
}

/** Decode optional metadata without changing the normal response body. */
export function readQueryCacheMetadata(header: string | null): DrizzleQueryCacheMetadata {
  if (header) {
    try {
      const data = JSON.parse(decodeURIComponent(header))
      if (data && typeof data === 'object')
        return data
    }
    catch {
      // Invalid metadata cannot attest that this response is authoritative.
    }
  }
  return {}
}
