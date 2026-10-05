import type { CustomCacheState } from '@rstore/shared'
import type { Ref } from 'vue'
import type { CacheRuntime } from './types'
import { ref, shallowRef } from 'vue'
import { updateItemIndexes } from './indexes'
import { clearItemMetadata, restoreItemMetadata } from './itemMetadata'
import { clearAllQueryState } from './queryState'

/** Replace the entire cache state immediately. */
export function setStateNow(ctx: CacheRuntime, value: CustomCacheState) {
  ctx.state.markers = value.markers || {}

  // Replacing the state means replacing everything derived from it. Indexes
  // are rebuilt below from the incoming items; leaving the old buckets in
  // place made a relation read return items the payload no longer had.
  ctx.state.collectionIndexes.clear()

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

  restoreItemMetadata(ctx, value)

  ctx.wrappedItems.clear()
  ctx.wrappedItemsMetadata.clear()
  ctx.collectionStateCache.clear()
  ctx.state.pageRefs.clear()
  ctx.state.queryMeta = value.queryMeta || {}

  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheReset', {
    store,
    meta: {},
  })
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
  clearItemMetadata(ctx)
  clearAllQueryState(ctx)

  const store = ctx.getStore()
  store.$hooks.callHookSync('afterCacheReset', {
    store,
    meta: {},
  })
}
