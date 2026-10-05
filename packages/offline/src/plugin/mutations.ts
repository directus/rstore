import type { OfflinePluginRuntime, QueuedManyMutation, QueuedMutation } from './types'
import { getOfflineDb, isCollectionIncluded } from './metadata'

/** Register cache persistence and offline mutation queue hooks. */
export function installMutationHooks(runtime: OfflinePluginRuntime, hook: any) {
  installCacheReadHooks(runtime, hook)
  installCachePersistenceHook(runtime, hook)
  installSingleMutationQueueHooks(runtime, hook)
  installManyMutationQueueHooks(runtime, hook)
}

function installCacheReadHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('beforeCacheReadFirst', ({ collection, setMarker }: any) => {
    if (isCollectionIncluded(runtime, collection)) {
      setMarker(undefined)
    }
  })

  hook('beforeCacheReadMany', ({ collection, setMarker }: any) => {
    if (isCollectionIncluded(runtime, collection)) {
      setMarker(undefined)
    }
  })
}

const cachePersistenceMetaKey = Symbol('rstoreOfflineCachePersistenceHandled')

function installCachePersistenceHook(runtime: OfflinePluginRuntime, hook: any) {
  hook('afterMutation', async (payload: any) => {
    await persistMutation(runtime, payload)
    if (payload.meta) {
      payload.meta[cachePersistenceMetaKey] = true
    }
  })

  hook('afterManyMutation', async (payload: any) => {
    // Unhandled many mutations emit per-item afterMutation hooks first. Queue
    // hooks abort many mutations, which skips those item hooks, so only the
    // latter path must be mirrored here.
    if (payload.meta?.[cachePersistenceMetaKey]) {
      return
    }

    const results = payload.getResult()
    if (payload.mutation === 'delete') {
      for (const [index, key] of (payload.keys ?? []).entries()) {
        await persistMutation(runtime, {
          collection: payload.collection,
          mutation: 'delete',
          key: key ?? payload.items?.[index]?.key,
          item: payload.items?.[index]?.item,
          getResult: () => undefined,
        })
      }
      return
    }

    for (const [index, result] of results.entries()) {
      const source = payload.items?.[index]
      await persistMutation(runtime, {
        collection: payload.collection,
        mutation: payload.mutation,
        key: source?.key ?? payload.keys?.[index],
        item: source?.item,
        getResult: () => result,
      })
    }
  })
}

/** Persist one committed single or many-mutation item into the local mirror. */
async function persistMutation(runtime: OfflinePluginRuntime, { collection, mutation, key, item, getResult }: any): Promise<void> {
  if (!isCollectionIncluded(runtime, collection)) {
    return
  }

  const db = getOfflineDb(runtime)
  if (mutation === 'delete') {
    const deleteKey = key ?? (item != null ? collection.getKey(item) : null)
    if (deleteKey != null) {
      await db.deleteItem(collection.name, String(deleteKey))
    }
    return
  }

  const result = getResult()
  if (!result) {
    return
  }
  const itemKey = collection.getKey(result) ?? key
  if (itemKey == null) {
    return
  }
  if (mutation === 'create') {
    await db.writeItem(collection.name, String(itemKey), result)
  }
  else if (mutation === 'update') {
    const existing = await db.readItem(collection.name, String(itemKey))
    await db.writeItem(collection.name, String(itemKey), existing ? { ...existing, ...result } : result)
  }
}

function installSingleMutationQueueHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('createItem', async ({ collection, setResult, item, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }

    const key = collection.getKey(item)
    if (key == null) {
      console.warn('[rstore/offline] Cannot createItem operation without a key. Please make sure to provide as much data as possible when creating offline items.')
      return
    }
    await queueMutation(runtime, {
      type: 'create',
      collectionName: collection.name,
      item,
      key,
      metadata,
    })
    setResult(item)
  })

  hook('updateItem', async ({ collection, setResult, item, key, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    await queueMutation(runtime, {
      type: 'update',
      collectionName: collection.name,
      item,
      key,
      metadata,
    })
    setResult(item)
  })

  hook('deleteItem', async ({ collection, abort, key, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    await queueMutation(runtime, {
      type: 'delete',
      collectionName: collection.name,
      key,
      metadata,
    })
    abort()
  })
}

function installManyMutationQueueHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('createMany', async ({ collection, setResult, items, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    const queued = collectKeyedItems(collection, items, 'createMany')
    if (!queued) {
      return
    }
    await queueMutation(runtime, {
      type: 'createMany',
      collectionName: collection.name,
      ...queued,
      metadata,
    })
    setResult(queued.items)
  })

  hook('updateMany', async ({ collection, setResult, items, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    const queued = collectKeyedItems(collection, items, 'updateMany')
    if (!queued) {
      return
    }
    await queueMutation(runtime, {
      type: 'updateMany',
      collectionName: collection.name,
      ...queued,
      metadata,
    })
    setResult(queued.items)
  })

  hook('deleteMany', async ({ collection, abort, keys, metadata }: any) => {
    if (!shouldQueueMutation(runtime, collection) || keys.length === 0) {
      return
    }
    await queueMutation(runtime, {
      type: 'deleteMany',
      collectionName: collection.name,
      keys,
      metadata,
    })
    abort()
  })
}

function shouldQueueMutation(runtime: OfflinePluginRuntime, collection: any) {
  return isCollectionIncluded(runtime, collection) && !navigator.onLine
}

/** Queue payload before persistence assigns its id and insertion time. */
type QueuedMutationData = Omit<QueuedMutation, 'id' | 'time'> | Omit<QueuedManyMutation, 'id' | 'time'>

/**
 * Persist one queued single-item or many-item mutation.
 *
 * @param runtime Offline plugin runtime that owns the queue store.
 * @param data Queue payload before persistence assigns its id and insertion time.
 */
async function queueMutation(runtime: OfflinePluginRuntime, data: QueuedMutationData): Promise<void> {
  const id = crypto.randomUUID()
  // Leave `metadata` out when absent, so unstamped operations keep their shape.
  const { metadata, ...rest } = data
  await getOfflineDb(runtime).writeItem(runtime.opsStoreName, id, {
    id,
    ...rest,
    ...metadata ? { metadata } : {},
    time: new Date(),
  } as QueuedMutation | QueuedManyMutation)
}

function collectKeyedItems(collection: any, items: any[], operation: 'createMany' | 'updateMany') {
  const queuedItems: Array<any> = []
  const keys: Array<string | number> = []
  for (const item of items) {
    const key = collection.getKey(item)
    if (key == null) {
      console.warn(`[rstore/offline] Cannot ${operation} operation without a key. Please make sure to provide as much data as possible when creating offline items.`)
      continue
    }
    queuedItems.push(item)
    keys.push(key)
  }

  return queuedItems.length
    ? { items: queuedItems, keys }
    : null
}
