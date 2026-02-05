import type { ResolvedCollection } from '@rstore/shared'
import { createItem, createMany, definePlugin, deleteItem, deleteMany, updateItem, updateMany } from '@rstore/core'
import { useIndexedDb } from './indexeddb'
import { getLocalStorageItem, setLocalStorageItem } from './localStorage'

export interface CreateOfflinePluginOptions {
  /**
   * The collections that should be handled by the offline plugin.
   */
  filterCollection?: (collection: ResolvedCollection) => boolean

  /**
   * The name of the IndexedDB database to use for offline storage.
   */
  dbName?: string

  /**
   * Allows cleaning up the data from the offline storage by version.
   */
  version?: number | string
}

interface OfflineMetadata {
  version: number | string
}

interface OfflineCollectionMetadata {
  updatedAt: number
}

interface QueuedMutation {
  id: string
  type: 'create' | 'update' | 'delete'
  collectionName: string
  key?: string | number
  item?: any
  time: Date
}

interface QueuedManyMutation {
  id: string
  type: 'createMany' | 'updateMany' | 'deleteMany'
  collectionName: string
  keys?: Array<string | number>
  items?: Array<any>
  time: Date
}

export function createOfflinePlugin(options: CreateOfflinePluginOptions = {}) {
  return definePlugin({
    name: 'offline',
    category: 'local',
    setup({ hook }) {
      // Skip server
      if (typeof window === 'undefined') {
        return
      }

      function getMetadataKey(collection: ResolvedCollection) {
        return `rstore-offline-metadata-${collection.name}`
      }

      let db: Awaited<ReturnType<typeof useIndexedDb>>

      hook('init', async () => {
        db = await useIndexedDb(options.dbName || 'rstore-offline')
      })

      const opsStoreName = 'rstore-offline-ops-queue'

      const globalMetadataKey = 'rstore-offline-global-metadata'
      const globalMetadata: OfflineMetadata | null = getLocalStorageItem(globalMetadataKey)

      hook('init', async ({ store }) => {
        if (options.version && globalMetadata?.version !== options.version) {
          // Clear database
          // await db.clearDatabase(opsStoreName)
          for (const collection of store.$collections) {
            if (isCollectionIncluded(collection)) {
              await db.clearDatabase(collection.name)
            }
          }
        }
      })

      function isCollectionIncluded(collection: ResolvedCollection): boolean {
        return options.filterCollection ? options.filterCollection(collection) : true
      }

      // CRDT State Synchronization

      hook('sync', async ({ store, setProgress, setCollectionLoaded, setCollectionSynced }) => {
        // Pause cache updates to prevent flickering while syncing
        store.$cache.pause()

        try {
          let completed = 0
          await Promise.all(store.$collections.map(async (collection) => {
            if (!isCollectionIncluded(collection)) {
              return
            }

            // Load metadata
            const metadataKey = getMetadataKey(collection)
            const metadata: OfflineCollectionMetadata | null = getLocalStorageItem(metadataKey)

            // Get last updatedAt
            let lastUpdatedAtRaw = 0
            if (metadata) {
              lastUpdatedAtRaw = metadata.updatedAt
            }
            const lastUpdatedAt = new Date(lastUpdatedAtRaw)

            // Load local items into the cache
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

            // Fetch new/updated items since last sync
            const newItems: Array<any> = []
            const deleteKeys: Array<string | number> = []
            await store.$hooks.callHook('syncCollection', {
              store,
              meta: {},
              collection,
              lastUpdatedAt,
              loadedItems: () => loadedItems,
              storeItems: (items) => {
                newItems.push(...items)
              },
              deleteItems: (keys) => {
                deleteKeys.push(...keys)
              },
            })

            // Cleanup deleted items
            for (const key of deleteKeys) {
              await db.deleteItem(collection.name, String(key))
              store.$cache.deleteItem({
                collection,
                key,
              })
            }

            // Store new/updated items
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

            setCollectionSynced(collection.name)

            // Update metadata
            const newMetadata: OfflineCollectionMetadata = {
              updatedAt: Date.now(),
            }
            setLocalStorageItem(metadataKey, newMetadata)

            completed++
            setProgress({
              percent: completed / store.$collections.length,
            })
          }))

          // Update global metadata
          if (options.version) {
            const newGlobalMetadata: OfflineMetadata = {
              version: options.version,
            }
            setLocalStorageItem(globalMetadataKey, newGlobalMetadata)
          }
        }
        finally {
          // Resume cache updates to apply all changes at once
          store.$cache.resume()
        }
      })

      hook('beforeCacheReadFirst', ({ collection, setMarker }) => {
        if (!isCollectionIncluded(collection)) {
          return
        }
        // Always read from the cache
        setMarker(undefined)
      })

      hook('beforeCacheReadMany', ({ collection, setMarker }) => {
        if (!isCollectionIncluded(collection)) {
          return
        }
        // Always read from the cache
        setMarker(undefined)
      })

      hook('afterMutation', async ({ collection, mutation, getResult }) => {
        if (!isCollectionIncluded(collection)) {
          return
        }

        if (mutation === 'create' || mutation === 'update') {
          const result = getResult()
          if (result) {
            const key = collection.getKey(result)
            if (key) {
              await db.writeItem(collection.name, String(key), result)
            }
          }
        }
        else if (mutation === 'delete') {
          const result = getResult()
          if (result) {
            const key = collection.getKey(result)
            if (key) {
              await db.deleteItem(collection.name, String(key))
            }
          }
        }
      })

      // CRDT Operations

      hook('createItem', async ({ collection, setResult, item }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        // Queue mutation
        const key = collection.getKey(item)
        if (key == null) {
          console.warn('[rstore/offline] Cannot createItem operation without a key. Please make sure to provide as much data as possible when creating offline items.')
          return
        }
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'create',
          collectionName: collection.name,
          item,
          key,
          time: new Date(),
        } as QueuedMutation)
        setResult(item)
      })

      hook('updateItem', async ({ collection, setResult, item, key }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        // Queue mutation
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'update',
          collectionName: collection.name,
          item,
          key,
          time: new Date(),
        } as QueuedMutation)
        setResult(item)
      })

      hook('deleteItem', async ({ collection, abort, key }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        // Queue mutation
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'delete',
          collectionName: collection.name,
          key,
          time: new Date(),
        } as QueuedMutation)
        abort()
      })

      hook('createMany', async ({ collection, setResult, items }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        const queuedItems: Array<any> = []
        const keys: Array<string | number> = []
        for (const item of items) {
          const key = collection.getKey(item)
          if (key == null) {
            console.warn('[rstore/offline] Cannot createMany operation without a key. Please make sure to provide as much data as possible when creating offline items.')
            continue
          }
          queuedItems.push(item)
          keys.push(key)
        }

        if (queuedItems.length === 0) {
          return
        }

        // Queue mutation
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'createMany',
          collectionName: collection.name,
          items: queuedItems,
          keys,
          time: new Date(),
        } as QueuedManyMutation)
        setResult(queuedItems)
      })

      hook('updateMany', async ({ collection, setResult, items }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        const queuedItems: Array<any> = []
        const keys: Array<string | number> = []
        for (const item of items) {
          const key = collection.getKey(item)
          if (key == null) {
            console.warn('[rstore/offline] Cannot updateMany operation without a key. Please make sure to provide as much data as possible when creating offline items.')
            continue
          }
          queuedItems.push(item)
          keys.push(key)
        }

        if (queuedItems.length === 0) {
          return
        }

        // Queue mutation
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'updateMany',
          collectionName: collection.name,
          items: queuedItems,
          keys,
          time: new Date(),
        } as QueuedManyMutation)
        setResult(queuedItems)
      })

      hook('deleteMany', async ({ collection, abort, keys }) => {
        if (!isCollectionIncluded(collection) || navigator.onLine) {
          return
        }

        if (keys.length === 0) {
          return
        }

        // Queue mutation
        const id = crypto.randomUUID()
        await db.writeItem(opsStoreName, id, {
          id,
          type: 'deleteMany',
          collectionName: collection.name,
          keys,
          time: new Date(),
        } as QueuedManyMutation)
        abort()
      })

      // CRDT Sync Operations

      hook('sync', async ({ store }) => {
        // Sync ops
        const queuedOperations: Array<QueuedMutation | QueuedManyMutation> = await db.readAllItems(opsStoreName)
        queuedOperations.sort((a, b) => a.time.getTime() - b.time.getTime())
        for (const op of queuedOperations) {
          // TODO improve relation handling (for example when a required related items was deleted on the remote source while offline)
          try {
            if (!navigator.onLine) {
              throw new Error('Went offline during processing queued operations')
            }
            const collection = store.$collections.find(c => c.name === op.collectionName)
            if (!collection) {
              throw new Error(`[rstore/offline] Cannot process queued operation for unknown collection "${op.collectionName}"`)
            }
            switch (op.type) {
              case 'create': {
                await createItem({
                  store,
                  collection,
                  item: op.item,
                })
                break
              }
              case 'update': {
                await updateItem({
                  store,
                  collection,
                  item: op.item,
                  key: op.key!,
                })
                break
              }
              case 'delete': {
                await deleteItem({
                  store,
                  collection,
                  key: op.key!,
                })
                break
              }
              case 'createMany': {
                await createMany({
                  store,
                  collection,
                  items: op.items!,
                })
                break
              }
              case 'updateMany': {
                await updateMany({
                  store,
                  collection,
                  items: op.items!,
                })
                break
              }
              case 'deleteMany': {
                await deleteMany({
                  store,
                  collection,
                  keys: op.keys!,
                })
                break
              }
            }
            // Remove processed operation
            await db.deleteItem(opsStoreName, op.id)
          }
          catch (error) {
            console.error('[rstore/offline] Failed to process queued operation', op, error)
          }
        }
      })

      // Sync on reconnect

      hook('init', ({ store }) => {
        window.addEventListener('online', async () => {
          // Sync state
          await store.$sync()
        })
      })
    },
  })
}
