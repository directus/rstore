import type { CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext } from './types.js'

/**
 * Resolve the layer-merged raw item for a key, or `undefined` if it does not
 * exist or has been deleted by a layer.
 *
 * Fast path: when a collection has no layers, the canonical base item is
 * returned directly with no allocation. This is the core perf win over the
 * previous implementation, which rebuilt a whole-collection snapshot on
 * every write regardless of whether layers were involved.
 */
export function resolveItem(ctx: EngineContext, collectionName: string, key: string | number): any | undefined {
  const collection = ctx.collections.get(collectionName)
  if (!collection) {
    return undefined
  }
  // Reconcile string/number key forms: items are stored under the canonical
  // `getKey` value (often numeric), but callers may look them up with the
  // string form (e.g. object-key iteration). The previous Record-based store
  // coerced every key to a string; mirror that leniency here.
  key = resolveStoredKey(collection, key)
  if (collection.layers.length === 0) {
    return collection.base.get(key)
  }

  let result = collection.base.get(key)
  // Apply layer states (insert / modify) in order; each merges on top.
  for (const layer of collection.layers) {
    if (!layer.skip && Object.prototype.hasOwnProperty.call(layer.state, key)) {
      result = {
        ...result,
        ...layer.state[key],
        $layer: layer,
      }
    }
  }
  // Layer deletes win over any state, matching the previous behaviour.
  for (const layer of collection.layers) {
    if (!layer.skip && layer.deletedItems.has(key)) {
      return undefined
    }
  }
  return result
}

/**
 * Compute the set of visible keys for a collection: base keys plus
 * layer-inserted keys, minus layer-deleted keys.
 */
export function getVisibleKeys(ctx: EngineContext, collectionName: string): Array<string | number> {
  const collection = ctx.collections.get(collectionName)
  if (!collection) {
    return []
  }
  if (collection.layers.length === 0) {
    return Array.from(collection.base.keys())
  }

  const keys = new Set<string | number>(collection.base.keys())
  for (const layer of collection.layers) {
    if (layer.skip) {
      continue
    }
    for (const key of Object.keys(layer.state)) {
      keys.add(coerceKey(key, collection))
    }
  }
  for (const layer of collection.layers) {
    if (layer.skip) {
      continue
    }
    for (const key of layer.deletedItems) {
      keys.delete(key)
    }
  }
  return Array.from(keys)
}

/**
 * Resolve a lookup key to the form actually stored in `base`. Items are keyed
 * by the canonical `getKey` value (often numeric), but callers and object-key
 * iteration may pass the string counterpart. Falls back to the numeric/string
 * twin when the exact key is absent, mirroring the previous Record-based store
 * (which coerced every key to a string).
 */
export function resolveStoredKey(collection: EngineCollectionState, key: string | number): string | number {
  if (collection.base.has(key)) {
    return key
  }
  if (typeof key === 'string') {
    const asNumber = Number(key)
    if (key !== '' && !Number.isNaN(asNumber) && collection.base.has(asNumber)) {
      return asNumber
    }
  }
  else {
    const asString = String(key)
    if (collection.base.has(asString)) {
      return asString
    }
  }
  return key
}

/**
 * Layer state objects are keyed by string (object keys). When the base item
 * keys are numeric, reconcile the type so `Set` membership works as expected.
 */
function coerceKey(key: string, collection: EngineCollectionState): string | number {
  return resolveStoredKey(collection, key)
}

/**
 * Get (creating if needed) the value->keys map for a collection index.
 */
export function getCollectionIndex(
  collection: EngineCollectionState,
  indexKey: string,
): Map<string, Set<string | number>> {
  let index = collection.indexes.get(indexKey)
  if (!index) {
    index = new Map()
    collection.indexes.set(indexKey, index)
  }
  return index
}

/**
 * Read an index bucket's key set, or `undefined` if the bucket is empty /
 * the index does not exist.
 */
export function getIndexBucket(
  ctx: EngineContext,
  collectionName: string,
  indexKey: string,
  indexValue: string,
): ReadonlySet<string | number> | undefined {
  const collection = ctx.collections.get(collectionName)
  if (!collection) {
    return undefined
  }
  return collection.indexes.get(indexKey)?.get(indexValue)
}

/**
 * Maintain a collection's indexes for a single item edit and record the
 * affected index buckets so their observers fire on the next flush.
 *
 * Mirrors the previous `updateItemIndexes`: only indexes whose fields
 * actually changed are touched, and only fully-defined values are indexed.
 */
export function updateItemIndexes(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
  previousData: any,
  newData: any = {},
): void {
  const collectionState = ctx.ensureCollection(collection.name)
  for (const [indexKey, indexFields] of collection.indexes) {
    // Skip indexes whose fields are unchanged by this edit.
    if (!indexFields.some(f => f in newData && (!previousData || newData[f] !== previousData[f]))) {
      continue
    }
    const index = getCollectionIndex(collectionState, indexKey)

    if (previousData) {
      const values = indexFields.map(f => previousData?.[f])
      if (values.every(v => v != null)) {
        const previousValue = values.join(':')
        const existingKeys = index.get(previousValue)
        if (existingKeys) {
          existingKeys.delete(key)
          ctx.observers.touchIndex(collection.name, indexKey, previousValue)
        }
      }
    }

    const newValues = indexFields.map(f => newData[f] ?? previousData?.[f])
    if (newValues.every(v => v != null)) {
      const newValue = newValues.join(':')
      let existingKeys = index.get(newValue)
      if (!existingKeys) {
        existingKeys = new Set()
        index.set(newValue, existingKeys)
      }
      existingKeys.add(key)
      ctx.observers.touchIndex(collection.name, indexKey, newValue)
    }
  }
}

/**
 * Remove a key from all of a collection's indexes (used on delete). Records
 * the affected buckets for observer notification.
 */
export function removeKeyFromIndexes(
  ctx: EngineContext,
  collection: ResolvedCollection<any, any, any>,
  key: string | number,
  item: any,
): void {
  if (!item) {
    return
  }
  const collectionState = ctx.collections.get(collection.name)
  if (!collectionState) {
    return
  }
  for (const [indexKey, indexFields] of collection.indexes) {
    const index = collectionState.indexes.get(indexKey)
    if (!index) {
      continue
    }
    const previousValue = indexFields.map(f => item[f]).join(':')
    const existingKeys = index.get(previousValue)
    if (existingKeys && existingKeys.delete(key)) {
      ctx.observers.touchIndex(collection.name, indexKey, previousValue)
    }
  }
}

/** A layer participates in resolution unless it is explicitly skipped. */
export function isLayerActive(layer: CacheLayer): boolean {
  return !layer.skip
}
