import type { Cache } from '@rstore/shared'
import type { CacheRuntime } from '../src/cache/types'
import assert from 'node:assert/strict'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { createCollectionApi } from '../src/api/createCollectionApi'
import { createCacheApi } from '../src/cache/api'
import { createCacheRuntime, mark } from '../src/cache/context'
import { writeItemNow } from '../src/cache/writes'

/** Public write payload accepted by the historical flat control. */
type WriteItemsParams = Parameters<Cache['writeItems']>[0]

/** Queue cursor mirroring the historical synchronous writeItems path. */
interface LegacyWriteItemsOperation {
  /** Complete collection write payload. */
  params: WriteItemsParams
  /** Next item to apply. */
  index: number
}

/**
 * Reproduce the pre-change flat, non-staggered writeItems queue path from
 * 3db362ce95fe5aed6c1e461f6f455ccf50354ad1. The real current writeItemNow
 * retains that path whenever no CacheWriteBatch is supplied.
 */
export function legacyWriteItems(ctx: CacheRuntime, params: WriteItemsParams) {
  const operation: LegacyWriteItemsOperation = { params, index: 0 }
  ctx.state.queue.push(operation as unknown as CacheRuntime['state']['queue'][number])
  ctx.isFlushingQueue = true
  try {
    while (operation.index < operation.params.items.length) {
      const { key, value: item } = operation.params.items[operation.index]!
      writeItemNow(ctx, {
        collection: operation.params.collection,
        key,
        item,
        meta: operation.params.meta,
        fromWriteItems: true,
      })
      operation.index++
    }

    if (operation.params.marker) {
      mark(ctx, operation.params.marker)
    }
    const store = ctx.getStore()
    store.$hooks.callHookSync('afterCacheWrite', {
      store,
      meta: {},
      collection: operation.params.collection,
      result: operation.params.items,
      marker: operation.params.marker,
      operation: 'write',
    })
    ctx.state.queue.shift()
  }
  finally {
    ctx.isFlushingQueue = false
  }
}

/** Reject benchmark inputs outside the legacy control scope. */
export function assertLegacyPreconditions(ctx: CacheRuntime) {
  assert.equal(ctx.cacheStaggering, 0, 'The legacy control only models non-staggered writeItems')
  assert.equal(ctx.state.paused, false, 'The legacy control expects an active cache')
  assert.equal(ctx.isFlushingQueue, false, 'The legacy control expects an idle cache queue')
  assert.equal(ctx.state.queue.length, 0, 'The legacy control expects an empty cache queue')
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
