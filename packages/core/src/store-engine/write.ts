import type { FieldTimestamps } from '@rstore/shared'
import type { DeleteItemParams, EngineContext, WriteItemForRelationParams, WriteItemParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { mergeItemFields } from '../crdt.js'
import { isKeyDefined } from '../key.js'
import { shouldResurrect } from '../tombstone.js'
import { removeKeyFromIndexes, updateItemIndexes } from './resolve.js'

/**
 * Get (creating if needed) the per-collection field-timestamp map used by the
 * CRDT field-level merge.
 */
function ensureCollectionTimestamps(ctx: EngineContext, collectionName: string): Map<string | number, FieldTimestamps> {
  let map = ctx.fieldTimestamps.get(collectionName)
  if (!map) {
    map = new Map()
    ctx.fieldTimestamps.set(collectionName, map)
  }
  return map
}

/** Read a key's stored field timestamps, or `undefined`. */
export function getFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number): FieldTimestamps | undefined {
  return ctx.fieldTimestamps.get(collectionName)?.get(key)
}

/** Store a key's field timestamps. */
export function setFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number, timestamps: FieldTimestamps): void {
  ensureCollectionTimestamps(ctx, collectionName).set(key, timestamps)
}

/**
 * Resolve and write a related child item, recursing through {@link writeItemNow}.
 * The child collection is resolved from the relation's candidate target names.
 */
export function writeItemForRelationNow(ctx: EngineContext, params: WriteItemForRelationParams): void {
  const { parentCollection, relationKey, relation, childItem, meta } = params
  const possibleCollections = Object.keys(relation.to)
  const nestedItemCollection = ctx.callbacks.resolveChildCollection(childItem, possibleCollections)
  if (!nestedItemCollection) {
    throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  const nestedKey = nestedItemCollection.getKey(childItem)
  if (!isKeyDefined(nestedKey)) {
    throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
  }

  writeItemNow(ctx, {
    collection: nestedItemCollection,
    key: nestedKey,
    item: childItem,
    meta,
  })
}

/**
 * Apply a single item write to the canonical base store, maintaining indexes,
 * tombstones, CRDT timestamps and observer notifications.
 *
 * Observer granularity is the core perf win: a field update to an existing
 * item touches only that item's observer, never the collection list — so a
 * 1000-item live list does not re-run when one of its members changes a field.
 * Inserts (new keys) and markers touch the list because they change the
 * visible-key set / gating of list reads.
 */
export function writeItemNow(ctx: EngineContext, params: WriteItemParams): void {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const collectionState = ctx.ensureCollection(collection.name)

  // Tombstone guard: a write with per-field timestamps is dropped when the
  // tombstone is newer; writes without timestamps always resurrect (explicit
  // user intent). A surviving tombstone is cleared so the item comes back.
  const tomb = ctx.tombstones.get(collection.name, key)
  if (tomb) {
    if (params.fieldTimestamps && !shouldResurrect(tomb, params.fieldTimestamps)) {
      return
    }
    ctx.tombstones.clear(collection.name, key)
  }

  const isNew = !collectionState.base.has(key)
  const isFrozen = Object.isFrozen(item)
  if (isFrozen) {
    // Frozen items are stored verbatim (no relation extraction / index work).
    collectionState.base.set(key, item)
  }
  else {
    const rawData = pickNonSpecialProps(item, true)

    // Split out relation fields and write nested items recursively.
    const data: Record<string, any> = {}
    for (const field in rawData) {
      if (field in collection.relations) {
        const relation = collection.relations[field]
        const rawItem = rawData[field]
        if (!rawItem || !relation) {
          continue
        }
        if (relation.many && !Array.isArray(rawItem)) {
          throw new Error(`Expected array for relation ${collection.name}.${field}`)
        }
        else if (!relation.many && Array.isArray(rawItem)) {
          throw new Error(`Expected object for relation ${collection.name}.${field}`)
        }
        if (Array.isArray(rawItem)) {
          for (const nestedItem of rawItem as any[]) {
            writeItemForRelationNow(ctx, {
              parentCollection: collection,
              relationKey: field,
              relation,
              childItem: nestedItem,
              meta,
            })
          }
        }
        else {
          writeItemForRelationNow(ctx, {
            parentCollection: collection,
            relationKey: field,
            relation,
            childItem: rawItem,
            meta,
          })
        }
      }
      else {
        data[field] = rawData[field]
      }
    }

    const existing = collectionState.base.get(key)
    updateItemIndexes(ctx, collection, key, existing, data)

    if (!existing) {
      collectionState.base.set(key, data)
      if (params.fieldTimestamps) {
        setFieldTimestamps(ctx, collection.name, key, { ...params.fieldTimestamps })
      }
    }
    else if (params.fieldTimestamps) {
      // CRDT field-level LWW merge against the existing item.
      const localTimestamps = getFieldTimestamps(ctx, collection.name, key) ?? {}
      const { merged, mergedTimestamps, conflicts } = mergeItemFields(
        existing,
        data,
        localTimestamps,
        params.fieldTimestamps,
      )
      setFieldTimestamps(ctx, collection.name, key, mergedTimestamps)
      collectionState.base.set(key, merged)
      if (conflicts.length > 0) {
        ctx.callbacks.onConflict?.({ collection, key, conflicts })
      }
    }
    else {
      collectionState.base.set(key, { ...existing, ...data })
    }
  }

  // Notify: the item always; the list only when the visible-key set changed.
  ctx.observers.touchItem(collection.name, key)
  if (isNew) {
    ctx.observers.touchList(collection.name)
  }

  if (marker) {
    ctx.markers[marker] = true
    // A marker flip un-gates list reads short-circuited on `!markers[marker]`.
    ctx.observers.touchList(collection.name)
  }

  if (meta?.$queryTracking) {
    meta.$queryTracking.items[collection.name] ??= new Set()
    meta.$queryTracking.items[collection.name]!.add(key)
  }

  if (!fromWriteItems) {
    ctx.callbacks.onAfterWrite?.({
      collection,
      key,
      result: [item],
      marker,
      operation: 'write',
    })
  }
}

/**
 * Remove a key from the canonical base store and its indexes, notifying the
 * item and list observers. Field timestamps and tombstones are handled by the
 * queue's delete path, not here (this mirrors the previous internal
 * `deleteItem`). Returns `true` if an item was actually removed.
 */
export function deleteItemFromBase(ctx: EngineContext, params: DeleteItemParams): boolean {
  const { collection, key } = params
  const collectionState = ctx.collections.get(collection.name)
  if (!collectionState) {
    return false
  }
  const item = collectionState.base.get(key)
  if (item === undefined) {
    return false
  }

  removeKeyFromIndexes(ctx, collection, key, item)
  collectionState.base.delete(key)

  ctx.observers.touchItem(collection.name, key)
  ctx.observers.touchList(collection.name)

  ctx.callbacks.onAfterWrite?.({
    collection,
    key,
    operation: 'delete',
  })
  return true
}
