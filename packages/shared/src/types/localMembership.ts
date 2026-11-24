/** Serializable identity of one exact page in the current store. */
export interface QueryPageTarget {
  /** Collection owning the page. */
  collection: string
  /** Serialized page id including query options and page index. */
  id: string
  /** Resolved query options used to confirm the page. */
  provenance: string
}

/** Insert relative to the exact page rather than changing its server keys. */
export type CreatePlacementPosition = 'start' | 'end' | { before: string | number }

/** Explicit insertion into an exact list. */
export interface CreatePlacement {
  /** Page captured before the mutation can navigate elsewhere. */
  page: QueryPageTarget
  /** Position relative to the server page. */
  position: CreatePlacementPosition
}

/** Serializable information saved alongside a pending create. */
export interface PendingCreatePlacement {
  /** Identity shared by the optimistic mutation and offline replay. */
  id: string
  /** Pages already resolved for the authenticated store. */
  targets: CreatePlacement[]
}

/** Optional membership support exposed by a reactive cache to Core and offline. */
export interface CacheCreateMembership {
  /** Resolve explicit and connector-inferred targets for the mutation. */
  prepare: (collection: string, row: Record<string, unknown>, explicit: CreatePlacement[]) => PendingCreatePlacement | undefined
  /** Publish the optimistic identity or restore a durable pending operation. */
  show: (placement: PendingCreatePlacement, key: string | number) => void
  /** Adopt the canonical key and start server reconciliation when acknowledged. */
  commit: (placement: PendingCreatePlacement, key: string | number, queued: boolean) => void
  /** Remove membership when the mutation fails permanently. */
  discard: (id: string) => void
}
