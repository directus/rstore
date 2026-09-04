import type { OfflineCollectionMetadata, OfflineMetadata, OfflinePluginRuntime } from './types'
import { getLocalStorageItem, setLocalStorageItem } from '../localStorage'
import { getMetadataKey, getOfflineDb, isCollectionIncluded } from './metadata'

/**
 * Load locally persisted items into the cache, then pull remote changes for
 * every included collection.
 *
 * Called by the sync orchestrator AFTER the queued offline mutations were
 * replayed, so `syncCollection` consumers see offline-created items on the
 * server and do not delete them locally.
 */
export async function pullCollections(runtime: OfflinePluginRuntime, { store, setProgress, setCollectionLoaded, setCollectionSynced, signal }: any): Promise<void> {
  throwIfAborted(signal)
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
        signal,
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
}

async function syncCollection(runtime: OfflinePluginRuntime, {
  store,
  collection,
  setCollectionLoaded,
  setCollectionSynced,
  signal,
}: any) {
  throwIfAborted(signal)
  const db = getOfflineDb(runtime)
  const metadataKey = getMetadataKey(collection)
  const metadata: OfflineCollectionMetadata | null = getLocalStorageItem(metadataKey)
  const lastUpdatedAt = new Date(metadata?.updatedAt ?? 0)
  // Capture the high-water mark before remote work begins. Rows written while
  // the hook runs must remain eligible for the next delta pull.
  const nextUpdatedAt = Date.now()

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
  let skipCursor = false
  await waitForCollectionHook(store.$hooks.callHook('syncCollection', {
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
    skipCursor: () => {
      skipCursor = true
    },
  }), runtime.options.syncCollectionTimeout, signal, collection.name)

  throwIfAborted(signal)
  // A filter can change while a remote hook awaits user/session state. Never
  // commit data for a collection that became excluded during that wait.
  if (!isCollectionIncluded(runtime, collection)) {
    return
  }

  await applySyncChanges(runtime, { store, collection, newItems, deleteKeys })
  setCollectionSynced(collection.name)
  if (!skipCursor) {
    setLocalStorageItem(metadataKey, {
      updatedAt: nextUpdatedAt,
    } satisfies OfflineCollectionMetadata)
  }
}

async function applySyncChanges(runtime: OfflinePluginRuntime, { store, collection, newItems, deleteKeys }: any) {
  const db = getOfflineDb(runtime)
  const writes = newItems.flatMap((item: any) => {
    const key = collection.getKey(item)
    return key == null ? [] : [{ key: String(key), value: item, cacheKey: key }]
  })
  await db.applyChanges(collection.name, {
    deleteKeys: deleteKeys.map((key: string | number) => String(key)),
    writes: writes.map(({ key, value }: any) => ({ key, value })),
  })

  for (const key of deleteKeys) {
    store.$cache.deleteItem({
      collection,
      key,
    })
  }

  for (const { cacheKey, value } of writes) {
    store.$cache.writeItem({
      collection,
      item: value,
      key: cacheKey,
    })
  }
}

/** Reject a pending hook wait on cancellation or a configured timeout. */
function waitForCollectionHook(hook: Promise<void>, timeout: number | undefined, signal: AbortSignal | undefined, collectionName: string): Promise<void> {
  if (!timeout && !signal) {
    return hook
  }
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: () => void
    const finish = (callback: () => void) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    abort = () => finish(() => reject(getAbortError(signal)))
    if (timeout && timeout > 0) {
      timer = setTimeout(() => finish(() => reject(new Error(`[rstore/offline] Pull for collection "${collectionName}" timed out after ${timeout}ms.`))), timeout)
    }
    signal?.addEventListener('abort', abort, { once: true })
    hook.then(
      () => finish(resolve),
      error => finish(() => reject(error)),
    )
    if (signal?.aborted) {
      abort()
    }
  })
}

/** Throw the abort reason before starting or applying a collection pull. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw getAbortError(signal)
  }
}

/** Return the signal's error reason or a portable abort error. */
function getAbortError(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }
  return new Error('Offline sync was aborted.')
}
