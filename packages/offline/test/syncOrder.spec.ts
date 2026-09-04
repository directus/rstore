import { createItem, updateItem } from '@rstore/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installOfflineSyncHook } from '../src/plugin/syncOrchestrator'
import { createCollection, createFakeStore, createHookCollector, createRuntime, stubLocalStorage } from './utils/plugin'

// The offline plugin registers a single ordered `sync` hook: queued offline
// mutations are replayed BEFORE the remote pull. Consumers of the
// `syncCollection` hook (nuxt-drizzle style) delete local keys missing on the
// server, so pulling first would wipe offline-created items from the local
// database before their queued create is ever sent — losing them for good if
// the replay then fails with a droppable error.

vi.mock('@rstore/core', () => ({
  createItem: vi.fn(),
  createMany: vi.fn(),
  deleteItem: vi.fn(),
  deleteMany: vi.fn(),
  updateItem: vi.fn(),
  updateMany: vi.fn(),
}))

describe('offline sync orchestration', () => {
  let collector: ReturnType<typeof createHookCollector>
  let runtime: ReturnType<typeof createRuntime>['runtime']
  let db: ReturnType<typeof createRuntime>['db']
  let collection: any
  let store: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
    stubLocalStorage()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    collector = createHookCollector()
    const created = createRuntime()
    runtime = created.runtime
    db = created.db
    collection = createCollection()
    store = createFakeStore([collection])
    installOfflineSyncHook(runtime, collector.hook)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Builds the payload core passes to the `sync` hook. */
  function syncPayload() {
    return {
      store,
      setProgress: vi.fn(),
      setCollectionLoaded: vi.fn(),
      setCollectionSynced: vi.fn(),
    }
  }

  /** Seeds one queued operation into the ops store. */
  function queueOperation(op: Record<string, any> = {}) {
    const queued = {
      id: 'op-1',
      type: 'update',
      collectionName: 'Todos',
      key: '1',
      item: { id: '1' },
      time: new Date(0),
      ...op,
    }
    db.stores.set(runtime.opsStoreName, new Map([[queued.id, queued]]))
    return queued
  }

  it('replays a queued create before the pull so the pull cannot delete it', async () => {
    // An item created offline: persisted locally, its create queued, and still
    // unknown to the server.
    db.stores.set('Todos', new Map([['offline-1', { id: 'offline-1', text: 'a' }]]))
    queueOperation({ type: 'create', key: 'offline-1', item: { id: 'offline-1', text: 'a' } })

    // Fake server: replaying the create registers the key remotely.
    const serverKeys = new Set<string>()
    vi.mocked(createItem).mockImplementation(async ({ item }: any) => {
      serverKeys.add(item.id)
    })

    // Consumer `syncCollection` hook modeled after nuxt-drizzle: it deletes
    // every locally loaded key the server does not have.
    store.$hooks.callHook.mockImplementation(async (name: string, payload: any) => {
      if (name !== 'syncCollection') {
        return
      }
      const missingKeys = payload.loadedItems()
        .map((item: any) => item.id)
        .filter((key: string) => !serverKeys.has(key))
      payload.deleteItems(missingKeys)
    })

    await collector.run('sync', syncPayload())

    // The create was replayed first, so the pull saw the item on the server
    // and did not delete it locally.
    expect(createItem).toHaveBeenCalled()
    expect(store.$cache.deleteItem).not.toHaveBeenCalled()
    expect(db.stores.get('Todos')!.has('offline-1')).toBe(true)
  })

  it('does not double-replay the queue when syncs overlap', async () => {
    queueOperation()

    // Hold the replay open so a second sync arrives while the first is
    // still in flight — the flaky-`online`-event scenario.
    let releaseReplay!: () => void
    vi.mocked(updateItem).mockImplementation(() => new Promise((resolve) => {
      releaseReplay = () => resolve(undefined)
    }))

    const first = collector.run('sync', syncPayload())
    const second = collector.run('sync', syncPayload())

    await vi.waitFor(() => expect(updateItem).toHaveBeenCalled())
    releaseReplay()
    await Promise.all([first, second])

    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(db.stores.get(runtime.opsStoreName)!.size).toBe(0)
  })

  it('runs a fresh sync once the previous one has finished', async () => {
    await collector.run('sync', syncPayload())
    await collector.run('sync', syncPayload())

    // The overlap guard must not latch: sequential syncs each pull.
    const syncCollectionCalls = store.$hooks.callHook.mock.calls
      .filter(([name]: [string]) => name === 'syncCollection')
    expect(syncCollectionCalls).toHaveLength(2)
  })

  it('resumes the cache after a collection sync times out', async () => {
    runtime.options.syncCollectionTimeout = 5
    store.$hooks.callHook.mockImplementation(async (name: string) => {
      if (name === 'syncCollection') {
        await new Promise<void>(() => {})
      }
    })

    await expect(collector.run('sync', syncPayload())).rejects.toThrow('Todos')

    expect(store.$cache.resume).toHaveBeenCalledOnce()
  })

  it('resumes the cache when an in-flight collection pull is aborted', async () => {
    const controller = new AbortController()
    store.$hooks.callHook.mockImplementation(async (name: string) => {
      if (name === 'syncCollection') {
        await new Promise<void>(() => {})
      }
    })
    const sync = collector.run('sync', {
      ...syncPayload(),
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(store.$hooks.callHook).toHaveBeenCalledWith('syncCollection', expect.anything()))
    controller.abort(new Error('cancelled by caller'))

    await expect(sync).rejects.toThrow('cancelled by caller')
    expect(store.$cache.resume).toHaveBeenCalledOnce()
  })

  it('does not apply a pull after its collection stops being included', async () => {
    let included = true
    runtime.options.filterCollection = () => included
    store.$hooks.callHook.mockImplementation(async (name: string, payload: any) => {
      if (name === 'syncCollection') {
        payload.storeItems([{ id: 'server-row' }])
        included = false
      }
    })

    await collector.run('sync', syncPayload())

    expect(db.applyChanges).not.toHaveBeenCalled()
    expect(store.$cache.writeItem).not.toHaveBeenCalledWith(expect.objectContaining({
      item: { id: 'server-row' },
    }))
  })

  it('keeps the collection cursor unchanged when the pull hook opts out', async () => {
    store.$hooks.callHook.mockImplementation(async (name: string, payload: any) => {
      if (name === 'syncCollection') {
        payload.skipCursor()
      }
    })

    await collector.run('sync', syncPayload())

    expect(localStorage.getItem('rstore-offline-metadata-Todos')).toBeNull()
  })

  it('uses a cursor captured before the remote pull starts', async () => {
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
    store.$hooks.callHook.mockImplementation(async (name: string) => {
      if (name === 'syncCollection') {
        Date.now()
      }
    })

    await collector.run('sync', syncPayload())

    expect(JSON.parse(localStorage.getItem('rstore-offline-metadata-Todos')!)).toEqual({ updatedAt: 100 })
    now.mockRestore()
  })
})
