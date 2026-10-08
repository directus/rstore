import type { DatabaseDeletion } from './utils/indexeddb'
import { IDBDatabase, IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIndexedDb } from '../src/indexeddb'
import { observeDatabaseDeletion } from './utils/indexeddb'

describe('indexedDB storage', () => {
  let factory: IDBFactory
  let dbName: string
  let handles: Array<Awaited<ReturnType<typeof useIndexedDb>>>
  let connections: Set<IDBDatabase>
  let deletions: DatabaseDeletion[]
  let cleaningUp: boolean

  beforeEach(() => {
    factory = new IDBFactory()
    dbName = `offline-test-${crypto.randomUUID()}`
    handles = []
    connections = new Set()
    deletions = []
    cleaningUp = false
    const nativeOpen = factory.open.bind(factory)
    // Observe actual emulator connections so teardown can release even a
    // faulty helper's leaked handle after the scored assertion has failed.
    vi.spyOn(factory, 'open').mockImplementation((...args) => {
      const request = nativeOpen(...args)
      request.addEventListener('success', () => {
        connections.add(request.result)
        if (cleaningUp)
          request.result.close()
      })
      return request
    })
    vi.stubGlobal('indexedDB', factory)
  })

  afterEach(async () => {
    try {
      for (const handle of handles)
        handle.dispose()
      cleaningUp = true
      for (const connection of connections)
        connection.close()
      // Closing leaked emulator handles is teardown only: the scenario must
      // already have observed release through the production dispose path.
      for (const deletion of deletions) {
        await expect.poll(() => deletion.settled, {
          message: 'Pending database deletion settles during cleanup',
          timeout: 1000,
          interval: 5,
        }).toBe(true)
      }
    }
    finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })

  /** Track every acquired public handle before its first database operation. */
  async function acquireStorage(prefix = dbName) {
    const storage = await useIndexedDb(prefix)
    handles.push(storage)
    return storage
  }

  it('reopens complete persisted rows after every handle closes', async () => {
    const open = vi.spyOn(factory, 'open')
    const first = await acquireStorage()
    const second = await acquireStorage()
    try {
      await first.writeItem('Todos', '1', { id: '1', text: 'first' })
      expect(await second.readItem('Todos', '1')).toEqual({ id: '1', text: 'first' })
      first.dispose()

      await expect(second.writeItem('Todos', '2', { id: '2', text: 'second' })).resolves.toBeUndefined()
      expect(await second.readAllItems('Todos')).toEqual([
        { id: '1', text: 'first' },
        { id: '2', text: 'second' },
      ])
      expect(open).toHaveBeenCalledTimes(1)
      second.dispose()

      const reopened = await acquireStorage()
      try {
        await expect(reopened.readAllItems('Todos')).resolves.toEqual([
          { id: '1', text: 'first' },
          { id: '2', text: 'second' },
        ])
        expect(open).toHaveBeenCalledTimes(2)
      }
      finally {
        reopened.dispose()
      }
    }
    finally {
      first.dispose()
      second.dispose()
    }
  })

  it('keeps database deletion blocked until the final owner releases its lease', async () => {
    const first = await acquireStorage()
    const second = await acquireStorage()
    await first.writeItem('Todos', '1', { id: '1', text: 'first' })
    expect(await second.readItem('Todos', '1')).toEqual({ id: '1', text: 'first' })

    first.dispose()
    const deletion = observeDatabaseDeletion(factory, `${dbName}-Todos`)
    deletions.push(deletion)
    await expect.poll(() => deletion.firstEvent, {
      message: 'Deletion reports a held lease rather than completing early',
      timeout: 1000,
      interval: 5,
    }).not.toBeNull()
    expect(deletion.firstEvent).toBe('blocked')
    expect(deletion.settled).toBe(false)

    await second.writeItem('Todos', '2', { id: '2', text: 'second' })
    expect(await second.readAllItems('Todos')).toEqual([
      { id: '1', text: 'first' },
      { id: '2', text: 'second' },
    ])
    expect(deletion.settled).toBe(false)

    second.dispose()
    await expect.poll(() => [deletion.settled, deletion.error], {
      message: 'Final lease release allows database deletion to complete',
      timeout: 1000,
      interval: 5,
    }).toEqual([true, null])
  })

  it('preserves complete rows and deletes only the requested collection and key', async () => {
    const storage = await acquireStorage()
    const reader = await acquireStorage()
    const target = { id: 'target', text: 'buy bread', done: false, details: { priority: 2 } }
    const survivor = { id: 'survivor', text: 'call Sam', done: true }
    const otherCollection = { id: 'target', title: 'shopping' }
    try {
      await storage.writeItem('Todos', 'target', target)
      await storage.writeItem('Todos', 'survivor', survivor)
      await storage.writeItem('Lists', 'target', otherCollection)

      const expectedTarget = { id: 'target', text: 'buy bread', done: false, details: { priority: 2 } }
      const expectedSurvivor = { id: 'survivor', text: 'call Sam', done: true }
      const expectedList = { id: 'target', title: 'shopping' }
      expect(target).toEqual(expectedTarget)
      expect(survivor).toEqual(expectedSurvivor)
      expect(otherCollection).toEqual(expectedList)
      expect(await reader.readAllItems('Todos')).toEqual([expectedSurvivor, expectedTarget])
      expect(await reader.readItem('Lists', 'target')).toEqual(expectedList)
      const retrieved = await reader.readItem('Todos', 'target')
      retrieved.details.priority = 99
      expect(await reader.readItem('Todos', 'target')).toEqual(expectedTarget)

      await storage.deleteItem('Todos', 'target')
      expect(await reader.readItem('Todos', 'target')).toBeUndefined()
      expect(await reader.readAllItems('Todos')).toEqual([expectedSurvivor])
      expect(await reader.readAllItems('Lists')).toEqual([expectedList])
    }
    finally {
      storage.dispose()
      reader.dispose()
    }
  })

  it('applies deletes and writes in one readwrite transaction', async () => {
    const storage = await acquireStorage()

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

  it('clears only the named collection in the named storage namespace', async () => {
    const primary = await acquireStorage()
    const other = await acquireStorage(`${dbName}-other`)
    await primary.writeItem('Todos', '1', { id: '1', text: 'primary' })
    await primary.writeItem('Lists', '1', { id: '1', title: 'keep list' })
    await other.writeItem('Todos', '1', { id: '1', text: 'other namespace' })

    expect(await primary.readItem('Todos', '1')).toEqual({ id: '1', text: 'primary' })
    expect(await other.readItem('Todos', '1')).toEqual({ id: '1', text: 'other namespace' })
    await primary.clearDatabase('Todos')

    expect(await primary.readAllItems('Todos')).toEqual([])
    expect(await primary.readAllItems('Lists')).toEqual([{ id: '1', title: 'keep list' }])
    expect(await other.readAllItems('Todos')).toEqual([{ id: '1', text: 'other namespace' }])
  })

  it('rolls back every queued delete and write when a later replacement cannot be cloned', async () => {
    const storage = await acquireStorage()
    const reader = await acquireStorage()
    await storage.writeItem('Todos', 'gone', { id: 'gone', text: 'Keep until commit' })
    await storage.writeItem('Todos', 'survivor', { id: 'survivor', done: false })

    await expect(storage.applyChanges('Todos', {
      deleteKeys: ['gone'],
      writes: [
        { key: 'new', value: { id: 'new', text: 'Must roll back' } },
        { key: 'invalid', value: { id: 'invalid', callback: () => undefined } },
      ],
    })).rejects.toMatchObject({ name: 'DataCloneError' })

    // A fresh read transaction waits for the failed write transaction to finish.
    expect(await reader.readAllItems('Todos')).toEqual([
      { id: 'gone', text: 'Keep until commit' },
      { id: 'survivor', done: false },
    ])

    await storage.applyChanges('Todos', {
      deleteKeys: ['gone'],
      writes: [
        { key: 'new', value: { id: 'new', text: 'Committed retry' } },
        { key: 'valid', value: { id: 'valid', done: true } },
      ],
    })
    expect(await reader.readAllItems('Todos')).toEqual([
      { id: 'new', text: 'Committed retry' },
      { id: 'survivor', done: false },
      { id: 'valid', done: true },
    ])
  })

  it('rejects uncloneable replacements without losing prior rows and accepts a later valid write', async () => {
    const storage = await acquireStorage()
    const reader = await acquireStorage()
    const original = { id: 'target', text: 'original', done: false }
    const survivor = { id: 'survivor', text: 'keep me', done: true }
    const replacement = { id: 'target', text: 'corrected', done: true }
    try {
      await storage.writeItem('Todos', 'target', original)
      await storage.writeItem('Todos', 'survivor', survivor)

      await expect(storage.writeItem('Todos', 'target', { id: 'target', value: () => undefined }))
        .rejects
        .toMatchObject({ name: 'DataCloneError' })

      expect(await reader.readAllItems('Todos')).toEqual([
        { id: 'survivor', text: 'keep me', done: true },
        { id: 'target', text: 'original', done: false },
      ])
      expect(original).toEqual({ id: 'target', text: 'original', done: false })
      expect(survivor).toEqual({ id: 'survivor', text: 'keep me', done: true })
      await expect(storage.writeItem('Todos', 'target', replacement)).resolves.toBeUndefined()
      expect(await reader.readAllItems('Todos')).toEqual([
        { id: 'survivor', text: 'keep me', done: true },
        { id: 'target', text: 'corrected', done: true },
      ])
      expect(replacement).toEqual({ id: 'target', text: 'corrected', done: true })
    }
    finally {
      storage.dispose()
      reader.dispose()
    }
  })
})
