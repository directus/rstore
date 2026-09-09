import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIndexedDb } from '../src/indexeddb'

describe('indexedDB storage', () => {
  let factory: IDBFactory
  let dbName: string

  beforeEach(() => {
    factory = new IDBFactory()
    dbName = `offline-test-${crypto.randomUUID()}`
    vi.stubGlobal('indexedDB', factory)
    vi.stubGlobal('window', { indexedDB: factory })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reuses one connection for repeated writes to one store', async () => {
    const open = vi.spyOn(factory, 'open')
    const storage = await useIndexedDb(dbName)

    await storage.writeItem('Todos', '1', { id: '1' })
    await storage.writeItem('Todos', '2', { id: '2' })

    expect(open).toHaveBeenCalledTimes(1)
    await storage.dispose()
  })

  it('writes, reads, and deletes one item', async () => {
    const storage = await useIndexedDb(dbName)

    await storage.writeItem('Todos', '1', { id: '1' })
    expect(await storage.readItem('Todos', '1')).toEqual({ id: '1' })

    await storage.deleteItem('Todos', '1')
    expect(await storage.readItem('Todos', '1')).toBeUndefined()

    await storage.dispose()
  })

  it('applies deletes and writes in one readwrite transaction', async () => {
    const storage = await useIndexedDb(dbName)

    await storage.writeItem('Todos', 'gone', { id: 'gone' })
    await storage.writeItem('Todos', 'keep', { id: 'keep' })

    const transactions = vi.spyOn(IDBDatabase.prototype, 'transaction')
    try {
      await storage.applyChanges('Todos', {
        deleteKeys: ['gone'],
        writes: [{ key: 'new', value: { id: 'new' } }],
      })

      expect(transactions.mock.calls.filter(([, mode]) => mode === 'readwrite')).toHaveLength(1)
      expect(await storage.readAllItems('Todos')).toEqual([{ id: 'keep' }, { id: 'new' }])
    }
    finally {
      transactions.mockRestore()
      await storage.dispose()
    }
  })

  it('rejects uncloneable values', async () => {
    const storage = await useIndexedDb(dbName)

    await expect(storage.writeItem('Todos', 'bad', { id: 'bad', value: () => undefined }))
      .rejects
      .toMatchObject({ name: 'DataCloneError' })

    await storage.dispose()
  })
})
