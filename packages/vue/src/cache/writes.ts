import type { Cache, Collection, CollectionDefaults, CustomCacheState, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheRuntime } from './types'
import { isKeyDefined, mergeItemFields, shouldResurrect } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { markRaw, ref, shallowRef } from 'vue'
import { ensureCollectionRef, getItemWrapKey, invalidateCollectionStateCache, mark } from './context'
import { removeItemIndexes, updateItemIndexes } from './indexes'

/** Delete an item immediately without going through the pause queue. */
export function deleteItemNow<TCollection extends Collection>(
  ctx: CacheRuntime,
  collection: ResolvedCollection<TCollection, CollectionDefaults, StoreSchema>,
  key: string | number,
) {
  const collectionState = ensureCollectionRef(ctx, collection.name).value
  const item = collectionState[key]
  if (!item) {
    return
  }

  removeItemIndexes(ctx, collection, key, item)
  invalidateCollectionStateCache(ctx, collection.name)
  delete collectionState[key]
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
}

/** Write a related nested item before linking it from its parent. */
export function writeItemForRelationNow({
  ctx,
  parentCollection,
  relationKey,
  relation,
  childItem,
  meta,
}: Parameters<Cache['writeItemForRelation']>[0] & { ctx: CacheRuntime }) {
  const store = ctx.getStore()
  const possibleCollections = Object.keys(relation.to)
  const nestedItemCollection = store.$getCollection(childItem, possibleCollections)
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

/** Write an item immediately without going through the pause queue. */
export function writeItemNow(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0]) {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const tomb = ctx.state.tombstones.get(collection.name, key)
  if (tomb) {
    if (params.fieldTimestamps && !shouldResurrect(tomb, params.fieldTimestamps)) {
      return
    }
    ctx.state.tombstones.clear(collection.name, key)
  }

  invalidateCollectionStateCache(ctx, collection.name)

  const collectionState = ensureCollectionRef(ctx, collection.name).value
  if (Object.isFrozen(item)) {
    collectionState[key] = item
  }
  else {
    writeMutableItem(ctx, params, collectionState)
  }
  if (marker) {
    mark(ctx, marker)
  }

  if (meta?.$queryTracking) {
    meta.$queryTracking.items[collection.name] ??= new Set()
    meta.$queryTracking.items[collection.name]!.add(key)
  }

  if (!fromWriteItems) {
    const store = ctx.getStore()
    store.$hooks.callHookSync('afterCacheWrite', {
      store,
      meta: {},
      collection,
      key,
      result: [item],
      marker,
      operation: 'write',
    })
  }
}

/** Replace the entire cache state immediately. */
export function setStateNow(ctx: CacheRuntime, value: CustomCacheState) {
  ctx.state.markers = value.markers || {}

  const newCollectionsState: Record<string, Ref<Record<string | number, any>>> = {}
  for (const collectionName in value.collections) {
    const collection = ctx.getStore().$collections.find(c => c.name === collectionName)
    if (!collection) {
      continue
    }
    const incomingCollectionState = value.collections[collectionName as keyof typeof value.collections] as Record<string | number, any>
    const collectionState = newCollectionsState[collectionName] = ref<Record<string | number, any>>({})
    for (const key in incomingCollectionState) {
      const item = incomingCollectionState[key]
      if (item) {
        const existing = collectionState.value[key]
        collectionState.value[key] = Object.isFrozen(item) ? item : shallowRef(item)
        updateItemIndexes(ctx, collection, key, existing, item)
      }
    }
  }
  ctx.state.collections = newCollectionsState

  const newModulesState: Record<string, ReturnType<typeof ref<any>>> = {}
  for (const moduleKey in value.modules) {
    newModulesState[moduleKey] = ref(value.modules[moduleKey])
  }
  ctx.state.modules = newModulesState

  ctx.wrappedItems.clear()
  ctx.wrappedItemsMetadata.clear()
  ctx.collectionStateCache.clear()

  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheReset', {
    store,
    meta: {},
  })

  ctx.state.queryMeta = value.queryMeta || {}
}

/** Clear all cache data immediately. */
export function clearNow(ctx: CacheRuntime) {
  ctx.state.markers = {}
  for (const collectionName in ctx.state.collections) {
    ctx.state.collections[collectionName]!.value = {}
  }
  for (const moduleKey in ctx.state.modules) {
    ctx.state.modules[moduleKey]!.value = {}
  }
  ctx.wrappedItems.clear()
  ctx.wrappedItemsMetadata.clear()
  ctx.collectionStateCache.clear()
  ctx.state.collectionIndexes.clear()
  ctx.state.fieldTimestamps.clear()
  const tombIds = Array.from(ctx.state.tombstones.entries(), ([, t]) => t)
  for (const t of tombIds) {
    ctx.state.tombstones.clear(t.collection, t.key)
  }

  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheReset', {
    store,
    meta: {},
  })
}

function writeMutableItem(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0], collectionState: Record<string | number, any>) {
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
  updateItemIndexes(ctx, collection, key, existing, data)

  if (!existing) {
    collectionState[key] = shallowRef(markRaw(data))
    if (params.fieldTimestamps) {
      ensureCollectionTimestamps(ctx, collection.name).set(key, { ...params.fieldTimestamps })
    }
  }
  else if (params.fieldTimestamps) {
    mergeTimestampedItem(ctx, params, collectionState, existing, data)
  }
  else {
    collectionState[key] = markRaw({
      ...existing,
      ...data,
    })
  }
}

function writeRelationField(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0], field: string, rawItem: any) {
  const relation = params.collection.relations[field]
  if (!rawItem || !relation) {
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
    })
  }
}

function mergeTimestampedItem(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0], collectionState: Record<string | number, any>, existing: any, data: any) {
  const collectionTs = ensureCollectionTimestamps(ctx, params.collection.name)
  const localTimestamps = collectionTs.get(params.key) ?? {}
  const { merged, mergedTimestamps, conflicts } = mergeItemFields(
    existing,
    data,
    localTimestamps,
    params.fieldTimestamps!,
  )
  collectionTs.set(params.key, mergedTimestamps)
  collectionState[params.key] = markRaw(merged)

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
