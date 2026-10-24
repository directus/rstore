import type { CacheRuntime } from './types'

/** Query consumer whose saved response state must survive garbage collection. */
export interface QueryStateHolder {
  /** Whether the owning effect scope has stopped. */
  readonly disposed: boolean
  /** Serialized id of the options the consumer currently represents. */
  readonly queryId: { readonly value: string }
}

/**
 * Consumers that saved page refs or metadata, by cache state then query id.
 *
 * Held weakly: an unscoped query is never disposed, it is only collected.
 */
const holders = new WeakMap<CacheRuntime['state'], Map<string, Array<WeakRef<QueryStateHolder>>>>()

/** Record that a live consumer saved state under `queryId`. */
export function holdQueryState(state: CacheRuntime['state'], queryId: string, holder: QueryStateHolder): void {
  let byQuery = holders.get(state)
  if (!byQuery) {
    byQuery = new Map()
    holders.set(state, byQuery)
  }
  const references = byQuery.get(queryId)
  if (!references) {
    byQuery.set(queryId, [new WeakRef(holder)])
  }
  else if (!references.some(reference => reference.deref() === holder)) {
    references.push(new WeakRef(holder))
  }
}

/**
 * Whether a live consumer still represents `queryId`.
 *
 * Consumers that ended, were collected or moved to other options are
 * forgotten along the way, and so is an id left without any.
 */
export function isQueryStateHeld(state: CacheRuntime['state'], queryId: string): boolean {
  const byQuery = holders.get(state)
  const references = byQuery?.get(queryId)
  if (!references) {
    return false
  }
  const live = references.filter((reference) => {
    const holder = reference.deref()
    return holder != null && !holder.disposed && holder.queryId.value === queryId
  })
  if (live.length) {
    byQuery!.set(queryId, live)
    return true
  }
  byQuery!.delete(queryId)
  return false
}

/** Forget the consumers of query ids that no longer have saved state. */
export function retainQueryStateHolders(state: CacheRuntime['state'], queryIds: Set<string>): void {
  const byQuery = holders.get(state)
  if (!byQuery) {
    return
  }
  // Map iteration tolerates deleting the current entry.
  for (const queryId of byQuery.keys()) {
    if (!queryIds.has(queryId)) {
      byQuery.delete(queryId)
    }
  }
}

/** Forget the consumers of a query id whose saved state was deleted. */
export function forgetQueryStateHolders(state: CacheRuntime['state'], queryId?: string): void {
  if (queryId == null) {
    holders.delete(state)
  }
  else {
    holders.get(state)?.delete(queryId)
  }
}
