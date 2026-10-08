import type { CreateOfflinePluginOptions } from '../../../packages/offline/src'
import { useIndexedDb } from '../../../packages/offline/src/indexeddb'
import { useOfflineStorage } from '../../../packages/offline/src/storage'
import { initialize, snapshot } from './offlineSession'

/** Seed native persistence before real store init evaluates storage version policy. */
export async function versionCleanup(options: { version?: number, storedVersion?: number, clearQueueOnVersionChange?: boolean }) {
  const dbName = `browser-version-${crypto.randomUUID()}`
  const db = await useIndexedDb(dbName)
  try {
    await db.writeItem('Todos', '1', { id: '1' })
    await db.writeItem('Lists', 'list', { id: 'list', title: 'selected list' })
    await db.writeItem('Notes', 'note', { id: 'note', title: 'excluded note' })
    await db.writeItem('rstore-offline-ops-queue', 'op-1', { id: 'op-1', type: 'delete', collectionName: 'Todos', key: '2', time: new Date(0) })
    localStorage.setItem('rstore-offline-global-metadata', JSON.stringify({ version: options.storedVersion ?? 1 }))
    localStorage.setItem('rstore-offline-metadata-Todos', JSON.stringify({ updatedAt: 123 }))
    localStorage.setItem('rstore-offline-metadata-Lists', JSON.stringify({ updatedAt: 456 }))
    localStorage.setItem('rstore-offline-metadata-Notes', JSON.stringify({ updatedAt: 789 }))
    const pluginOptions: CreateOfflinePluginOptions = {
      dbName,
      version: options.version,
      clearQueueOnVersionChange: options.clearQueueOnVersionChange,
      filterCollection: collection => collection.name !== 'Notes',
    }
    await initialize(pluginOptions, ['Todos', 'Lists', 'Notes'])
    return {
      ...await snapshot(),
      lists: await db.readAllItems('Lists'),
      notes: await db.readAllItems('Notes'),
      metadata: localStorage.getItem('rstore-offline-metadata-Todos'),
      listsMetadata: localStorage.getItem('rstore-offline-metadata-Lists'),
      notesMetadata: localStorage.getItem('rstore-offline-metadata-Notes'),
    }
  }
  finally {
    db.dispose()
  }
}

/** Public storage API sorts saved queue, clears selected rows, and preserves other collections. */
export async function publicStorage() {
  const dbName = `browser-storage-${crypto.randomUUID()}`
  const raw = await useIndexedDb(dbName)
  const storage = await useOfflineStorage(dbName)
  try {
    for (const [id, key, time] of [['a-newest', '2', 20], ['z-oldest', '1', 10]] as const)
      await raw.writeItem('rstore-offline-ops-queue', id, { id, type: 'delete', collectionName: 'Todos', key, time: new Date(time) })
    await raw.writeItem('Todos', '1', { id: '1' })
    await raw.writeItem('Lists', 'list', { id: 'list', title: 'selected list' })
    await raw.writeItem('Notes', 'n', { id: 'n' })
    localStorage.setItem('rstore-offline-metadata-Todos', JSON.stringify({ updatedAt: 1 }))
    localStorage.setItem('rstore-offline-metadata-Lists', JSON.stringify({ updatedAt: 3 }))
    localStorage.setItem('rstore-offline-metadata-Notes', JSON.stringify({ updatedAt: 2 }))
    const orderedQueue = (await storage.readQueue()).map(op => ({ ...op, time: op.time.toISOString() }))
    await storage.clearQueue()
    await storage.clearCollections(['Todos', 'Lists'])
    await storage.clearMetadata(['Todos', 'Lists'])
    return {
      orderedQueue,
      queue: await storage.readQueue(),
      todos: await raw.readAllItems('Todos'),
      lists: await raw.readAllItems('Lists'),
      notes: await raw.readAllItems('Notes'),
      metadata: localStorage.getItem('rstore-offline-metadata-Todos'),
      listsMetadata: localStorage.getItem('rstore-offline-metadata-Lists'),
      notesMetadata: localStorage.getItem('rstore-offline-metadata-Notes'),
    }
  }
  finally {
    storage.dispose()
    raw.dispose()
  }
}
