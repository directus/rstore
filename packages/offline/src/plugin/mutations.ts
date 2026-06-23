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

function installCachePersistenceHook(runtime: OfflinePluginRuntime, hook: any) {
  hook('afterMutation', async ({ collection, mutation, getResult }: any) => {
    if (!isCollectionIncluded(runtime, collection)) {
      return
    }

    const db = getOfflineDb(runtime)
    const result = getResult()
    if (!result) {
      return
    }
    const key = collection.getKey(result)
    if (!key) {
      return
    }
    if (mutation === 'create' || mutation === 'update') {
      await db.writeItem(collection.name, String(key), result)
    }
    else if (mutation === 'delete') {
      await db.deleteItem(collection.name, String(key))
    }
  })
}

function installSingleMutationQueueHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('createItem', async ({ collection, setResult, item }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }

    const key = collection.getKey(item)
    if (key == null) {
      console.warn('[rstore/offline] Cannot createItem operation without a key. Please make sure to provide as much data as possible when creating offline items.')
      return
    }
    await queueSingleMutation(runtime, {
      type: 'create',
      collectionName: collection.name,
      item,
      key,
    })
    setResult(item)
  })

  hook('updateItem', async ({ collection, setResult, item, key }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    await queueSingleMutation(runtime, {
      type: 'update',
      collectionName: collection.name,
      item,
      key,
    })
    setResult(item)
  })

  hook('deleteItem', async ({ collection, abort, key }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    await queueSingleMutation(runtime, {
      type: 'delete',
      collectionName: collection.name,
      key,
    })
    abort()
  })
}

function installManyMutationQueueHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('createMany', async ({ collection, setResult, items }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    const queued = collectKeyedItems(collection, items, 'createMany')
    if (!queued) {
      return
    }
    await queueManyMutation(runtime, {
      type: 'createMany',
      collectionName: collection.name,
      ...queued,
    })
    setResult(queued.items)
  })

  hook('updateMany', async ({ collection, setResult, items }: any) => {
    if (!shouldQueueMutation(runtime, collection)) {
      return
    }
    const queued = collectKeyedItems(collection, items, 'updateMany')
    if (!queued) {
      return
    }
    await queueManyMutation(runtime, {
      type: 'updateMany',
      collectionName: collection.name,
      ...queued,
    })
    setResult(queued.items)
  })

  hook('deleteMany', async ({ collection, abort, keys }: any) => {
    if (!shouldQueueMutation(runtime, collection) || keys.length === 0) {
      return
    }
    await queueManyMutation(runtime, {
      type: 'deleteMany',
      collectionName: collection.name,
      keys,
    })
    abort()
  })
}

function shouldQueueMutation(runtime: OfflinePluginRuntime, collection: any) {
  return isCollectionIncluded(runtime, collection) && !navigator.onLine
}

async function queueSingleMutation(runtime: OfflinePluginRuntime, data: Omit<QueuedMutation, 'id' | 'time'>) {
  const id = crypto.randomUUID()
  await getOfflineDb(runtime).writeItem(runtime.opsStoreName, id, {
    id,
    ...data,
    time: new Date(),
  } satisfies QueuedMutation)
}

async function queueManyMutation(runtime: OfflinePluginRuntime, data: Omit<QueuedManyMutation, 'id' | 'time'>) {
  const id = crypto.randomUUID()
  await getOfflineDb(runtime).writeItem(runtime.opsStoreName, id, {
    id,
    ...data,
    time: new Date(),
  } satisfies QueuedManyMutation)
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
