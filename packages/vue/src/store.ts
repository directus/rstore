import type { Collection, CollectionDefaults, CollectionsFromStoreSchema, FindOptions, Plugin, ResolvedModule, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { createStoreCore, normalizeCollectionRelations, resolveCollection } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createEventHook } from '@vueuse/core'
import { ref, type Ref } from 'vue'
import { createCollectionApi, type VueCollectionApi } from './api'
import { createCache } from './cache'

export interface CreateStoreOptions<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  schema: TSchema
  collectionDefaults?: TCollectionDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
  isServer?: boolean
  /**
   * Experimental: Enable garbage collection for items that are not referenced by any query or other item.
   */
  experimentalGarbageCollection?: boolean
}

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
  $collection: (collectionName: string) => VueCollectionApi<any, TCollectionDefaults, TSchema, WrappedItem<any, TCollectionDefaults, TSchema>>
  $onCacheReset: (callback: () => void) => () => void
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

  return createStoreCore<TSchema, TCollectionDefaults>({
    schema: options.schema,
    collectionDefaults: options.collectionDefaults,
    plugins: options.plugins,
    cache: createCache({
      getStore: () => storeProxy,
    }),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
    isServer: options.isServer,
    transformStore: (store) => {
      const privateStore = store as unknown as PrivateVueStore

      const queryCache: Map<string, VueCollectionApi<Collection, TCollectionDefaults, TSchema, WrappedItem<Collection, TCollectionDefaults, TSchema>>> = new Map()

      function getApi(key: string) {
        if (!queryCache.has(key)) {
          const collection = storeProxy.$collections.find(m => m.name === key)
          if (!collection) {
            throw new Error(`Collection ${key} not found`)
          }
          queryCache.set(key, createCollectionApi(storeProxy, collection))
        }
        return queryCache.get(key)
      }

      privateStore.$_collectionNames = new Set(store.$collections.map(m => m.name))

      const cacheResetEvent = createEventHook()

      store.$hooks.hook('afterCacheReset', async () => {
        await cacheResetEvent.trigger()
      })

      storeProxy = new Proxy(store, {
        get(_, key) {
          if (typeof key === 'string' && privateStore.$_collectionNames.has(key)) {
            return getApi(key)
          }

          if (key === '$collection') {
            return (collectionName: string) => getApi(collectionName)
          }

          if (key === '$onCacheReset') {
            return cacheResetEvent.on
          }

          if (typeof key === 'string' && key.startsWith('$experimental') && Reflect.has(options, key.substring(1))) {
            return Reflect.get(options, key.substring(1))
          }

          if (key === '$wrapMutation') {
            return <TMutation extends (...args: any[]) => unknown>(mutation: TMutation) => {
              const $loading = ref(false)
              const $error = ref<Error | null>(null)
              const $time = ref(0)
              const wrappedMutation = async (...args: Parameters<TMutation>) => {
                $loading.value = true
                const start = performance.now()
                try {
                  await mutation(...args)
                  $error.value = null
                }
                catch (e) {
                  $error.value = e as Error
                  throw e
                }
                finally {
                  $loading.value = false
                  $time.value = performance.now() - start
                }
              }
              wrappedMutation.$loading = $loading
              wrappedMutation.$error = $error
              wrappedMutation.$time = $time
              return wrappedMutation
            }
          }

          if (key === '$modulesCache') {
            return modulesCache
          }

          return Reflect.get(store, key)
        },
      }) as VueStore<TSchema, TCollectionDefaults>

      return storeProxy
    },
  }) as Promise<VueStore<TSchema, TCollectionDefaults>>
}

export function addCollection(store: VueStore, collection: Collection) {
  const privateStore = store as unknown as PrivateVueStore

  if (privateStore.$_collectionNames.has(collection.name)) {
    throw new Error(`Collection ${collection.name} already exists`)
  }

  const resolvedCollection = resolveCollection(collection, store.$collectionDefaults)
  store.$collections.push(resolvedCollection)
  privateStore.$_collectionNames.add(collection.name)

  normalizeCollectionRelations([resolvedCollection])
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

declare module '@rstore/shared' {
  export interface MutationSpecialProps {
    $loading: Ref<boolean>
    $error: Ref<Error | null>
    $time: Ref<number>
  }
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
