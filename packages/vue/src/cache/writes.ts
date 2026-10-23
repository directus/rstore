import type { Cache, Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { CacheRuntime, CacheWriteBatch } from './types'
import { mergeItemFields, shouldResurrect } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { markRaw, shallowRef } from 'vue'
import { ensureCollectionRef, getItemWrapKey, invalidateCollectionStateCache, mark, removeFieldTimestampsForItem } from './context'
import { removeItemIndexes, updateItemIndexes } from './indexes'
import { forgetInspectionKey, rememberInspectionKey } from './inspectionKeys'
import { invalidateMissingPageRefsForItem } from './queryState'
import { resolveRelationWriteParams } from './relationWrite'
import { invalidateCollectionWrite, setCollectionItem } from './writePublication'

/** Delete an item immediately without going through the pause queue. */
export function deleteItemNow<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
): boolean {
  const collectionState = ensureCollectionRef(ctx, collection.name).value
  const item = collectionState[key]
  if (!item) {
    return false
  }

  removeItemIndexes(ctx, collection, key, item)
  invalidateCollectionStateCache(ctx, collection.name)
  delete collectionState[key]
  forgetInspectionKey(ctx, collection.name, key)
  invalidateCollectionStateCache(ctx, collection.name)
  removeFieldTimestampsForItem(ctx, collection.name, key)

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

/** Write an item immediately without going through the pause queue. */
export function writeItemNow(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0] & { batch?: CacheWriteBatch }) {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const tomb = ctx.state.tombstones.get(collection.name, key)
  if (tomb) {
    if (params.fieldTimestamps && !shouldResurrect(tomb, params.fieldTimestamps)) {
      return
    }
    ctx.state.tombstones.clear(collection.name, key)
  }

  invalidateCollectionWrite(ctx, collection.name, params.batch)

  const collectionState = ensureCollectionRef(ctx, collection.name).value
  if (Object.isFrozen(item)) {
    setCollectionItem(collectionState, key, item, params.batch)
  }
  else {
    writeMutableItem(ctx, params, collectionState)
  }
  rememberInspectionKey(ctx, collection.name, key)
  invalidateMissingPageRefsForItem(ctx, collection.name, key)
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

function writeMutableItem(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0] & { batch?: CacheWriteBatch }, collectionState: Record<string | number, any>) {
  const { collection, key, item } = params
  const rawData = pickNonSpecialProps(item, true)
  const data: Record<string, any> = {}

  for (const field in rawData) {
    if (field in collection.relations) {
      writeRelationField(ctx, params, field, rawData[field])
    }
    else {
      data[field] = rawData[field]
    }
  }

  const existing = collectionState[key]
  if (!existing) {
    updateItemIndexes(ctx, collection, key, undefined, data, params.batch)
    setCollectionItem(collectionState, key, shallowRef(markRaw(data)), params.batch)
    if (params.fieldTimestamps) {
      ensureCollectionTimestamps(ctx, collection.name).set(key, { ...params.fieldTimestamps })
    }
  }
  else if (params.fieldTimestamps) {
    mergeTimestampedItem(ctx, params, collectionState, existing, data)
  }
  else {
    updateItemIndexes(ctx, collection, key, existing, data, params.batch)
    setCollectionItem(collectionState, key, markRaw({
      ...existing,
      ...data,
    }), params.batch)
  }
}

function writeRelationField(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0] & { batch?: CacheWriteBatch }, field: string, rawItem: any) {
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

function mergeTimestampedItem(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0] & { batch?: CacheWriteBatch }, collectionState: Record<string | number, any>, existing: any, data: any) {
  const collectionTs = ensureCollectionTimestamps(ctx, params.collection.name)
  const localTimestamps = collectionTs.get(params.key) ?? {}
  const { merged, mergedTimestamps, conflicts } = mergeItemFields(
    existing,
    data,
    localTimestamps,
    params.fieldTimestamps!,
  )
  // Rejected remote fields must not change relation membership.
  updateItemIndexes(ctx, params.collection, params.key, existing, merged, params.batch)
  collectionTs.set(params.key, mergedTimestamps)
  setCollectionItem(collectionState, params.key, markRaw(merged), params.batch)

  if (conflicts.length > 0) {
    const store = ctx.getStore()
    store.$hooks.callHookSync('cacheConflict', {
      store,
      meta: {},
      collection: params.collection,
      key: params.key,
      conflicts,
    })
  }
}

function ensureCollectionTimestamps(ctx: CacheRuntime, collectionName: string) {
  let collectionTs = ctx.state.fieldTimestamps.get(collectionName)
  if (!collectionTs) {
    collectionTs = new Map()
    ctx.state.fieldTimestamps.set(collectionName, collectionTs)
  }
  return collectionTs
}
