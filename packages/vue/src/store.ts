import type { Cache, Collection, CollectionDefaults, CollectionsFromStoreSchema, ResolvedModule, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { VueCollectionApi } from './api'
import type { VueCachePrivate } from './cache/types'
import type { CreateStoreOptions } from './storeOptions'
import { createStoreCore, normalizeCollectionRelations, resolveCollection, resolveCollectionOppositeRelations } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createEventHook, tryOnScopeDispose } from '@vueuse/core'
import { reactive, toValue, watch } from 'vue'
import { createCollectionApi } from './api'
import { createCache } from './cache'
import { cacheWriteEventHook } from './events'
import { wrapMutation } from './wrapMutation'

export type { CreateStoreOptions } from './storeOptions'

export type VueStoreCollectionApiProxy<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> = {
  [M in CollectionsFromStoreSchema<TSchema> as M['name']]: VueCollectionApi<M, TCollectionDefaults, TSchema, WrappedItem<M, TCollectionDefaults, TSchema>>
}

export type VueStore<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> = StoreCore<TSchema, TCollectionDefaults> & VueStoreCollectionApiProxy<TSchema, TCollectionDefaults> & {
  $collection: (collectionName: MaybeRefOrGetter<string>) => VueCollectionApi<any, TCollectionDefaults, TSchema, WrappedItem<any, TCollectionDefaults, TSchema>>
  $onCacheReset: (callback: () => void) => { off: () => void }
  $experimentalGarbageCollection?: boolean
  $modulesCache: WeakMap<(...args: any[]) => ResolvedModule<any, any>, ResolvedModule<any, any>>
}

interface PrivateVueStore {
  $_collectionNames: Set<string>
}

export async function createStore<
  const TSchema extends StoreSchema,
  const TCollectionDefaults extends CollectionDefaults,
>(options: CreateStoreOptions<TSchema, TCollectionDefaults>): Promise<VueStore<TSchema, TCollectionDefaults>> {
  let storeProxy = undefined as unknown as VueStore<TSchema, TCollectionDefaults>

  const modulesCache = new WeakMap<(...args: any[]) => ResolvedModule<any, any>, ResolvedModule<any, any>>()

  // The cache starts its timers right away: a store that fails to build
  // (invalid option, plugin setup or init error) must still stop them.
  const cache = createCache({
    getStore: () => storeProxy,
    cacheStaggering: options.cacheStaggering,
    tombstoneGc: options.tombstoneGc,
    isServer: options.isServer,
    queryStateRetention: options.queryStateRetention,
  })

  return createStoreCore<TSchema, TCollectionDefaults>({
    schema: options.schema,
    collectionDefaults: options.collectionDefaults,
    plugins: options.plugins,
    cache,
    hooks: createHooks<TSchema, TCollectionDefaults>(),
    findDefaults: options.findDefaults,
    isServer: options.isServer,
    syncImmediately: options.syncImmediately,
    batching: options.batching,
    mutationHistory: options.mutationHistory,
    transformStore: (store) => {
      const privateStore = store as unknown as PrivateVueStore

      const queryCache: Map<string, VueCollectionApi<Collection, TCollectionDefaults, TSchema, WrappedItem<Collection, TCollectionDefaults, TSchema>>> = new Map()

      function getCachedApiByKey(key: string) {
        if (!queryCache.has(key)) {
          const collection = storeProxy.$collections.find(m => m.name === key)
          if (!collection) {
            throw new Error(`Collection ${key} not found`)
          }
          queryCache.set(key, createCollectionApi({
            store: storeProxy,
            getCollection: () => collection,
          }))
        }
        return queryCache.get(key)
      }

      privateStore.$_collectionNames = new Set(store.$collections.map(m => m.name))

      const cacheResetEvent = createEventHook()

      store.$hooks.hook('afterCacheReset', async () => {
        await cacheResetEvent.trigger()
      })

      store.$hooks.hook('afterCacheWrite', (payload) => {
        cacheWriteEventHook.trigger(payload)
      })

      store.$syncState = reactive(store.$syncState)

      storeProxy = new Proxy(store, {
        get(_, key) {
          if (typeof key === 'string' && privateStore.$_collectionNames.has(key)) {
            return getCachedApiByKey(key)
          }

          if (key === '$collection') {
            return (collectionName: MaybeRefOrGetter<string>) => {
              if (typeof collectionName === 'string') {
                return getCachedApiByKey(collectionName)
              }

              const invalidateEvent = createEventHook()

              tryOnScopeDispose(() => {
                invalidateEvent.clear()
              })

              watch(collectionName, () => {
                invalidateEvent.trigger()
              })

              return createCollectionApi({
                store: storeProxy,
                getCollection: () => {
                  const name = toValue(collectionName)
                  const collection = storeProxy.$collections.find(m => m.name === name)
                  if (!collection) {
                    throw new Error(`Collection ${name} not found`)
                  }
                  return collection
                },
                onInvalidate: invalidateEvent.on,
              })
            }
          }

          if (key === '$onCacheReset') {
            return cacheResetEvent.on
          }

          if (typeof key === 'string' && key.startsWith('$experimental') && Reflect.has(options, key.substring(1))) {
            return Reflect.get(options, key.substring(1))
          }

          if (key === '$wrapMutation') {
            return wrapMutation
          }

          if (key === '$modulesCache') {
            return modulesCache
          }

          return Reflect.get(store, key)
        },
      }) as VueStore<TSchema, TCollectionDefaults>

      return storeProxy
    },
  }).catch((error) => {
    try {
      // Stops the timers even when the half-built store's dispose hooks fail.
      cache.dispose()
    }
    catch {
      // The construction error is the actionable one.
    }
    throw error
  }) as Promise<VueStore<TSchema, TCollectionDefaults>>
}

/** Register a batch of collections, resolving relations and rebuilding cached indexes once. */
export function addCollections(store: VueStore, collections: readonly Collection[]) {
  if (!collections.length)
    return

  const privateStore = store as unknown as PrivateVueStore
  const names = new Set<string>()
  const resolvedCollections = collections.map((collection) => {
    if (privateStore.$_collectionNames.has(collection.name) || names.has(collection.name)) {
      throw new Error(`Collection ${collection.name} already exists`)
    }
    names.add(collection.name)
    return resolveCollection(collection, store.$collectionDefaults)
  })

  // Prepare the whole batch before publishing it, so an invalid definition
  // cannot leave earlier collections registered after the call fails.
  normalizeCollectionRelations(resolvedCollections)
  for (const collection of resolvedCollections) {
    store.$collections.push(collection)
    privateStore.$_collectionNames.add(collection.name)
  }
  resolveCollectionOppositeRelations(store.$collections)
  // New relations add indexes to existing collections. Rebuild from cached
  // rows once the full schema is known, including targets cached before this call.
  ;(store.$cache as Cache & VueCachePrivate)._private.rebuildIndexes()
}

export function addCollection(store: VueStore, collection: Collection) {
  addCollections(store, [collection])
}

export function removeCollection(store: VueStore, collectionName: string) {
  const privateStore = store as unknown as PrivateVueStore

  const index = store.$collections.findIndex(m => m.name === collectionName)
  if (index === -1) {
    throw new Error(`Collection ${collectionName} not found`)
  }

  const collection = store.$collections[index]!
  store.$cache.clearCollection({ collection })

  store.$collections.splice(index, 1)
  privateStore.$_collectionNames.delete(collectionName)
}

let activeStore: VueStore | null = null

/**
 * Set the active store for testing modules or code outside of Vue components that need to access the store.
 */
export function setActiveStore(store: VueStore | null) {
  activeStore = store
}

/**
 * Get the active store. This is useful for testing modules or code outside of Vue components that need to access the store.
 */
export function getActiveStore(): VueStore | null {
  return activeStore
}
