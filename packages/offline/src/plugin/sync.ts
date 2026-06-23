import type { OfflineCollectionMetadata, OfflineMetadata, OfflinePluginRuntime } from './types'
import { getLocalStorageItem, setLocalStorageItem } from '../localStorage'
import { getMetadataKey, getOfflineDb, isCollectionIncluded } from './metadata'

/** Register storage version cleanup and collection sync hooks. */
export function installSyncHooks(runtime: OfflinePluginRuntime, hook: any) {
  hook('init', async ({ store }: any) => {
    const db = getOfflineDb(runtime)
    if (runtime.options.version && runtime.globalMetadata?.version !== runtime.options.version) {
      for (const collection of store.$collections) {
        if (isCollectionIncluded(runtime, collection)) {
          await db.clearDatabase(collection.name)
        }
      }
    }
  })

  hook('sync', async ({ store, setProgress, setCollectionLoaded, setCollectionSynced }: any) => {
    store.$cache.pause()
    try {
      let completed = 0
      await Promise.all(store.$collections.map(async (collection: any) => {
        if (!isCollectionIncluded(runtime, collection)) {
          return
        }
        await syncCollection(runtime, {
          store,
          collection,
          setCollectionLoaded,
          setCollectionSynced,
        })
        completed++
        setProgress({
          percent: completed / store.$collections.length,
        })
      }))

      if (runtime.options.version) {
        const newGlobalMetadata: OfflineMetadata = {
          version: runtime.options.version,
        }
        setLocalStorageItem(runtime.globalMetadataKey, newGlobalMetadata)
      }
    }
    finally {
      store.$cache.resume()
    }
  })
}

async function syncCollection(runtime: OfflinePluginRuntime, {
  store,
  collection,
  setCollectionLoaded,
  setCollectionSynced,
}: any) {
  const db = getOfflineDb(runtime)
  const metadataKey = getMetadataKey(collection)
  const metadata: OfflineCollectionMetadata | null = getLocalStorageItem(metadataKey)
  const lastUpdatedAt = new Date(metadata?.updatedAt ?? 0)

  const loadedItems = await db.readAllItems(collection.name)
  for (const item of loadedItems) {
    const key = collection.getKey(item)
    if (key == null) {
      continue
    }
    store.$cache.writeItem({
      collection,
      item,
      key,
    })
  }
  setCollectionLoaded(collection.name)

  const newItems: Array<any> = []
  const deleteKeys: Array<string | number> = []
  await store.$hooks.callHook('syncCollection', {
    store,
    meta: {},
    collection,
    lastUpdatedAt,
    loadedItems: () => loadedItems,
    storeItems: (items: any[]) => {
      newItems.push(...items)
    },
    deleteItems: (keys: Array<string | number>) => {
      deleteKeys.push(...keys)
    },
  })

  await applySyncChanges(runtime, { store, collection, newItems, deleteKeys })
  setCollectionSynced(collection.name)
  setLocalStorageItem(metadataKey, {
    updatedAt: Date.now(),
  } satisfies OfflineCollectionMetadata)
}

async function applySyncChanges(runtime: OfflinePluginRuntime, { store, collection, newItems, deleteKeys }: any) {
  const db = getOfflineDb(runtime)
  for (const key of deleteKeys) {
    await db.deleteItem(collection.name, String(key))
    store.$cache.deleteItem({
      collection,
      key,
    })
  }

  for (const item of newItems) {
    const key = collection.getKey(item)
    if (key == null) {
      continue
    }
    await db.writeItem(collection.name, String(key), item)
    store.$cache.writeItem({
      collection,
      item,
      key,
    })
  }
}
