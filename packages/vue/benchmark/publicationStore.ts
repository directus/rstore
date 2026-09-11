import type { Cache } from '@rstore/shared'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createCollectionApi } from '../src/api/createCollectionApi'
import { createCacheApi } from '../src/cache/api'
import { createCacheRuntime } from '../src/cache/context'

/** Public write payload accepted by the per-item control. */
type WriteItemsParams = Parameters<Cache['writeItems']>[0]

/**
 * Model writeItems without atomic publication by applying identical rows
 * through current public writeItem behavior.
 */
export function writeItemsPerItem(cache: Cache, store: any, params: WriteItemsParams) {
  for (let index = 0; index < params.items.length; index++) {
    const { key, value: item } = params.items[index]!
    cache.writeItem({
      collection: params.collection,
      key,
      item,
      meta: params.meta,
      fromWriteItems: true,
      marker: index === params.items.length - 1 ? params.marker : undefined,
    })
  }

  store.$hooks.callHookSync('afterCacheWrite', {
    store,
    meta: {},
    collection: params.collection,
    result: params.items,
    marker: params.marker,
    operation: 'write',
  })
}

/** Build an isolated real cache with the public collection query API. */
export async function createBenchmarkStore() {
  let storeProxy: any
  const runtime = createCacheRuntime({
    getStore: () => storeProxy,
    tombstoneGc: false,
  })
  const cache = createCacheApi(runtime)
  const collectionApis = new Map<string, any>()

  storeProxy = await createStoreCore({
    schema: [{ name: 'BenchmarkItems' }],
    plugins: [],
    cache,
    hooks: createHooks(),
    syncImmediately: false,
    transformStore: store => new Proxy(store, {
      get(target, key) {
        if (key === 'BenchmarkItems') {
          if (!collectionApis.has(key)) {
            collectionApis.set(key, createCollectionApi({
              store: storeProxy,
              getCollection: () => storeProxy.$collections[0],
            }))
          }
          return collectionApis.get(key)
        }
        return Reflect.get(target, key)
      },
    }),
  })

  return { cache, runtime, store: storeProxy }
}

/** Generate independent deterministic expected data for one sample. */
export function createItems(itemCount: number) {
  return Array.from({ length: itemCount }, (_, index) => ({
    key: index + 1,
    value: {
      id: index + 1,
      group: index % 10,
      name: `Item ${index + 1}`,
    },
  }))
}
