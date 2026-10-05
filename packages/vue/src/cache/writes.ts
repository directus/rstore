import type { Cache, Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { CacheRuntime, CacheWriteBatch } from './types'
import { pickNonSpecialProps } from '@rstore/shared'
import { markRaw, shallowRef } from 'vue'
import { ensureCollectionRef, getItemWrapKey, invalidateCollectionStateCache, mark } from './context'
import { removeItemIndexes, updateItemIndexes } from './indexes'
import { runBeforeWrite } from './interception'
import { removeItemMetadataForItem } from './itemMetadata'
import { resolveRelationWriteParams } from './relationWrite'
import { invalidateCollectionWrite, setCollectionItem } from './writePublication'

/** Write parameters as processed by the queue. */
type WriteParams = Parameters<Cache['writeItem']>[0] & { batch?: CacheWriteBatch }

/** Delete an item immediately without going through the pause queue. */
export function deleteItemNow<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
): boolean {
  // Metadata can exist without a row (written before the row arrived).
  removeItemMetadataForItem(ctx, collection.name, key)
  const collectionState = ensureCollectionRef(ctx, collection.name).value
  const item = collectionState[key]
  if (!item) {
    return false
  }

  removeItemIndexes(ctx, collection, key, item)
  invalidateCollectionStateCache(ctx, collection.name)
  delete collectionState[key]
  invalidateCollectionStateCache(ctx, collection.name)

  const wrapKey = getItemWrapKey(collection, key, undefined)
  ctx.wrappedItems.delete(wrapKey)
  ctx.wrappedItemsMetadata.delete(wrapKey)

  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheWrite', {
    store,
    meta: {},
    collection,
    key,
    operation: 'delete',
  })
  return true
}

/** Write a related nested item before linking it from its parent. */
export function writeItemForRelationNow({
  ctx,
  parentCollection,
  relationKey,
  relation,
  childItem,
  meta,
  batch,
}: Parameters<Cache['writeItemForRelation']>[0] & { ctx: CacheRuntime, batch?: CacheWriteBatch }) {
  writeItemNow(ctx, {
    ...resolveRelationWriteParams(ctx, { parentCollection, relationKey, relation, childItem, meta }),
    batch,
  })
}

/**
 * Write an item immediately without going through the pause queue.
 *
 * `cacheBeforeWriteItem` handlers run first, against the committed row: they
 * can replace the stored row or drop the write. Relation children are written
 * only when the parent write survives.
 */
export function writeItemNow(ctx: CacheRuntime, params: WriteParams) {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const collectionState = ensureCollectionRef(ctx, collection.name).value
  // Frozen rows are stored as-is, without relation splitting or merging.
  const frozen = Object.isFrozen(item)
  let data: Record<string, any> = item
  let relations: Array<[string, any]> | undefined
  if (!frozen) {
    const rawData = pickNonSpecialProps(item, true)
    data = {}
    for (const field in rawData) {
      if (field in collection.relations) {
        (relations ??= []).push([field, rawData[field]])
      }
      else {
        data[field] = rawData[field]
      }
    }
  }
  // Read before relation children are written: they run the hook again.
  const replacement = runBeforeWrite(ctx, params, collectionState, data)
  if (replacement === false) {
    return
  }

  invalidateCollectionWrite(ctx, collection.name, params.batch)
  if (frozen && !replacement) {
    setCollectionItem(collectionState, key, item, params.batch)
  }
  else {
    if (relations) {
      for (const [field, value] of relations) {
        writeRelationField(ctx, params, field, value)
      }
    }
    storeRow(ctx, params, collectionState, data, replacement)
  }
  invalidateCollectionWrite(ctx, collection.name, params.batch)

  if (marker) {
    mark(ctx, marker)
  }

  if (meta?.$queryTracking) {
    meta.$queryTracking.items[collection.name] ??= new Set()
    meta.$queryTracking.items[collection.name]!.add(key)
  }

  if (!fromWriteItems) {
    const store = ctx.getStore()
    const payload: CacheWriteBatch['deferredAfterCacheWrites'][number] = {
      store,
      meta: {},
      collection,
      key,
      result: [item],
      marker,
      operation: 'write',
    }
    if (params.batch) {
      params.batch.deferredAfterCacheWrites.push(payload)
    }
    else {
      store.$hooks.callHookSync('afterCacheWrite', payload)
    }
  }
}

/**
 * Store the row of a write: the handler replacement when there is one,
 * otherwise the incoming fields merged into the committed row.
 */
function storeRow(
  ctx: CacheRuntime,
  params: WriteParams,
  collectionState: Record<string | number, any>,
  data: Record<string, any>,
  replacement: Record<string, any> | undefined,
) {
  const { collection, key } = params
  const existing = collectionState[key]
  if (replacement) {
    updateItemIndexes(ctx, collection, key, existing, replacement, params.batch)
    setCollectionItem(collectionState, key, existing ? markRaw(replacement) : shallowRef(markRaw(replacement)), params.batch)
  }
  else if (!existing) {
    updateItemIndexes(ctx, collection, key, undefined, data, params.batch)
    setCollectionItem(collectionState, key, shallowRef(markRaw(data)), params.batch)
  }
  else {
    updateItemIndexes(ctx, collection, key, existing, data, params.batch)
    setCollectionItem(collectionState, key, markRaw({
      ...existing,
      ...data,
    }), params.batch)
  }
}

function writeRelationField(ctx: CacheRuntime, params: WriteParams, field: string, rawItem: any) {
  const relation = params.collection.relations[field]
  if (!relation) {
    return
  }
  // An included empty relation is authoritative too: cached children absent
  // from this response must not be retained while query ownership reconciles.
  const tracking = params.meta?.$queryTracking
  if (tracking) {
    const relations = tracking.includedRelations ??= {}
    const items = relations[params.collection.name] ??= new Map()
    const fields = items.get(params.key) ?? new Set<string>()
    fields.add(field)
    items.set(params.key, fields)
  }
  if (!rawItem) {
    return
  }
  if (relation.many && !Array.isArray(rawItem)) {
    throw new Error(`Expected array for relation ${params.collection.name}.${field}`)
  }
  if (!relation.many && Array.isArray(rawItem)) {
    throw new Error(`Expected object for relation ${params.collection.name}.${field}`)
  }

  const items = Array.isArray(rawItem) ? rawItem : [rawItem]
  for (const nestedItem of items) {
    writeItemForRelationNow({
      ctx,
      parentCollection: params.collection,
      relationKey: field as never,
      relation,
      childItem: nestedItem,
      meta: params.meta,
      batch: params.batch,
    })
  }
}
