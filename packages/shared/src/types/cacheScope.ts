import type { WriteItem } from './cache'
import type { ResolvedCollection } from './collection'
import type { FieldTimestampValue } from './crdt'

/** One indexed equality partition of a collection. */
export interface CacheScope {
  /** Single indexed field in this collection. */
  field: string
  /** Exact value of the indexed partition. */
  value: string | number
}

/** Options for publishing an authoritative findMany result. */
export interface CompleteScopeResult {
  /** Connector attestation that every authorized row in this partition was returned. */
  completeScope?: CacheScope
  /** Comparable backend snapshot revision, when available. */
  revision?: FieldTimestampValue
}

/** A request fence captured before loading a complete partition. */
export interface CacheScopeRequest {
  /** Atomically replace this partition if the request still owns it. */
  replace: (rows: WriteItem[], options: { revision?: FieldTimestampValue, canPublish?: () => boolean }) => Promise<boolean>
  /** Release the request's retention lease. */
  release: () => void
}

/** Optional complete-scope support supplied by the cache implementation. */
export interface CacheScopes {
  /** Request a scoped replacement using an indexed partition. */
  begin: (collection: ResolvedCollection, scope: CacheScope) => CacheScopeRequest
  /** Test whether the index contains a complete usable snapshot. */
  isComplete: (collection: ResolvedCollection, scope: CacheScope) => boolean
}
