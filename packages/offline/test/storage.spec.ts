import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIndexedDb } from '../src/indexeddb'
import { useOfflineStorage } from '../src/storage'
import { stubLocalStorage } from './utils/plugin'

describe('public offline storage', () => {
  let dbName: string

  beforeEach(() => {
    const indexedDb = new IDBFactory()
    dbName = `offline-storage-${crypto.randomUUID()}`
    vi.stubGlobal('indexedDB', indexedDb)
    vi.stubGlobal('window', { indexedDB: indexedDb })
    stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads and clears the queue, collections, and metadata without exposing storage layout', async () => {
    const rawStorage = await useIndexedDb(dbName)
    await rawStorage.writeItem('rstore-offline-ops-queue', 'later', {
      id: 'later',
      type: 'delete',
      collectionName: 'Todos',
      key: '2',
      time: new Date(20),
    })
    await rawStorage.writeItem('rstore-offline-ops-queue', 'first', {
      id: 'first',
      type: 'delete',
      collectionName: 'Todos',
      key: '1',
      time: new Date(10),
    })
    await rawStorage.writeItem('Todos', '1', { id: '1' })
    localStorage.setItem('rstore-offline-metadata-Todos', JSON.stringify({ updatedAt: 1 }))

    const storage = await useOfflineStorage(dbName)

    await expect(storage.readQueue()).resolves.toMatchObject([{ id: 'first' }, { id: 'later' }])
    await storage.clearQueue()
    await storage.clearCollections(['Todos'])
    await storage.clearMetadata(['Todos'])

    expect(await storage.readQueue()).toEqual([])
    expect(await rawStorage.readAllItems('Todos')).toEqual([])
    expect(localStorage.getItem('rstore-offline-metadata-Todos')).toBeNull()
    await storage.dispose()
    await rawStorage.dispose()
  })
})
