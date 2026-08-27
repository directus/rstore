import type { ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, KeyId } from './types.js'
import { getPublicKey } from './identity.js'
import { getVisibleKeyIds, resolveItemById } from './view.js'

/** Return the joined value for an item/index pair, or undefined when incomplete. */
function getIndexValue(item: any, fields: string[]): string | undefined {
  if (!item) {
    return undefined
  }
  const values = fields.map(field => item[field])
  return values.every(value => value != null) ? values.join(':') : undefined
}

/** Get or create one collection index. */
function ensureIndex(state: EngineCollectionState, indexKey: string): Map<string, Set<KeyId>> {
  let index = state.indexes.get(indexKey)
  if (!index) {
    index = new Map()
    state.indexes.set(indexKey, index)
  }
  return index
}

/** Add a key to one index bucket. */
function addIndexKey(index: Map<string, Set<KeyId>>, value: string, id: KeyId): void {
  let keys = index.get(value)
  if (!keys) {
    keys = new Set()
    index.set(value, keys)
  }
  keys.add(id)
}

/**
 * Reconcile every index against two fully resolved visible values. This avoids
 * indexing rejected CRDT patches or values hidden by optimistic layers.
 */
export function reconcileItemIndexes(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  id: KeyId,
  previous: any | undefined,
  next: any | undefined,
): void {
  const state = ctx.ensureCollection(collection.name)
  for (const [indexKey, fields] of collection.indexes) {
    const previousValue = getIndexValue(previous, fields)
    const nextValue = getIndexValue(next, fields)
    if (previousValue === nextValue) {
      continue
    }

    const index = state.indexes.get(indexKey)
    if (previousValue !== undefined && index) {
      const keys = index.get(previousValue)
      if (keys?.delete(id)) {
        if (keys.size === 0) {
          index.delete(previousValue)
        }
        ctx.observers.touchIndex(collection.name, indexKey, previousValue)
      }
      if (index.size === 0) {
        state.indexes.delete(indexKey)
      }
    }

    if (nextValue !== undefined) {
      addIndexKey(ensureIndex(state, indexKey), nextValue, id)
      ctx.observers.touchIndex(collection.name, indexKey, nextValue)
    }
  }
}

/** Rebuild indexes from the effective visible view after a whole-cache reset. */
export function rebuildIndexes(ctx: EngineContext, collection: ResolvedCollection<any, any, any>): void {
  const state = ctx.ensureCollection(collection.name)
  state.indexes.clear()
  for (const id of getVisibleKeyIds(state)) {
    const item = resolveItemById(state, id)
    if (!item) {
      continue
    }
    for (const [indexKey, fields] of collection.indexes) {
      const value = getIndexValue(item, fields)
      if (value !== undefined) {
        addIndexKey(ensureIndex(state, indexKey), value, id)
      }
    }
  }
}

/** Return a public key set for one non-empty index bucket. */
export function getIndexBucket(
  ctx: EngineContext,
  collectionName: string,
  indexKey: string,
  indexValue: string,
): ReadonlySet<string | number> | undefined {
  const state = ctx.collections.get(collectionName)
  const ids = state?.indexes.get(indexKey)?.get(indexValue)
  if (!state || !ids?.size) {
    return undefined
  }
  return new Set(Array.from(ids, id => getPublicKey(state, id)))
}
