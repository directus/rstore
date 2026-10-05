import { createTestStore } from '#test-utils/store/integrationStore'
import { createMultiplayerPlugin, getFieldTimestamps, getTombstone } from '@rstore/multiplayer'
import { describe, expect, it, vi } from 'vitest'

// 0.9 keeps the pre-plugin cache arguments and methods as deprecated aliases
// mapped onto write metadata and the plugin's item metadata (removed in 0.10).

/** Store using the plugin, with a spy on dev warnings. */
async function setup(options: Record<string, any> = {}) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const store = await createTestStore({
    schema: [{ name: 'todos' }],
    plugins: [createMultiplayerPlugin({ tombstoneGc: false })],
    ...options,
  } as any) as any
  const todos = store.$collections[0]
  /** Committed row, through the public state snapshot. */
  const read = (key: string) => store.$cache.getState().collections.todos?.[key]
  /** Warnings mentioning a text. */
  const warnings = (text: string) => warn.mock.calls.filter(([message]) => String(message).includes(text))
  return { store, cache: store.$cache, todos, read, warnings }
}

describe('deprecated LWW aliases with createMultiplayerPlugin()', () => {
  it('merges writeItem({ fieldTimestamps }) and warns once', async () => {
    const { store, cache, todos, read, warnings } = await setup()
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'New', done: false }, fieldTimestamps: { title: 20, done: 20 } })
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'Stale' }, fieldTimestamps: { title: 10 } })

    expect(read('1')).toMatchObject({ title: 'New', done: false })
    expect(getFieldTimestamps(store, 'todos', '1')).toMatchObject({ title: 20, done: 20 })
    expect(warnings('fieldTimestamps')).toHaveLength(1)
  })

  it('records a tombstone for deleteItem({ deletedAt }) and warns once', async () => {
    const { store, cache, todos, read, warnings } = await setup()
    cache.deleteItem({ collection: todos, key: '1', deletedAt: 20 })
    cache.deleteItem({ collection: todos, key: '2', deletedAt: 20 })
    cache.writeItem({ collection: todos, key: '1', item: { id: '1' }, metadata: { fieldTimestamps: { id: 10 } } })

    expect(read('1')).toBeUndefined()
    expect(getTombstone(store, 'todos', '2')?.deletedAt).toBe(20)
    expect(warnings('deletedAt')).toHaveLength(1)
  })

  it('maps applyMutation({ fieldTimestamps, deletedAt }) onto metadata', async () => {
    const { store, cache, todos, read } = await setup()
    cache.applyMutation({ collection: todos, mutation: 'update', key: '1', result: { id: '1', title: 'New' }, fieldTimestamps: { title: 20 } })
    cache.applyMutation({ collection: todos, mutation: 'update', key: '1', result: { id: '1', title: 'Stale' }, fieldTimestamps: { title: 10 } })
    cache.applyMutation({ collection: todos, mutation: 'delete', key: '2', deletedAt: 30 })

    expect(read('1')?.title).toBe('New')
    expect(getTombstone(store, 'todos', '2')?.deletedAt).toBe(30)
  })

  it('forwards mutate({ fieldTimestamps }) through core to the cache', async () => {
    const { store, read } = await setup()
    await store.todos.mutate({ mutation: 'update', item: { id: '1', title: 'New' }, fieldTimestamps: { title: 20 } }, ({ item }: any) => item)
    await store.todos.mutate({ mutation: 'update', item: { id: '1', title: 'Stale' }, fieldTimestamps: { title: 10 } }, ({ item }: any) => item)

    expect(read('1')?.title).toBe('New')
  })

  it('reads and writes the plugin metadata through the old cache methods', async () => {
    const { store, cache, todos, warnings } = await setup()
    cache.writeItem({ collection: todos, key: '1', item: { id: '1' } })
    cache.writeFieldTimestamps({ collectionName: 'todos', key: '1', timestamps: { title: 5 } })
    cache.deleteItem({ collection: todos, key: 'old', metadata: { deletedAt: 10 } })
    cache.deleteItem({ collection: todos, key: 'new', metadata: { deletedAt: 30 } })

    expect(getFieldTimestamps(store, 'todos', '1')).toEqual({ title: 5 })
    expect(cache.readFieldTimestamps({ collectionName: 'todos', key: '1' })).toEqual({ title: 5 })
    expect(cache.tombstones.get('todos', 'old')).toEqual({ collection: 'todos', key: 'old', deletedAt: 10 })
    expect(cache.tombstones.size()).toBe(2)
    expect(Array.from(cache.tombstones.entries(), ([, tombstone]: any) => tombstone.key)).toEqual(['old', 'new'])
    expect(cache.gcTombstones(20)).toEqual([{ collection: 'todos', key: 'old' }])
    expect(getTombstone(store, 'todos', 'old')).toBeUndefined()
    for (const method of ['readFieldTimestamps', 'writeFieldTimestamps', 'tombstones', 'gcTombstones']) {
      expect(warnings(method)).toHaveLength(1)
    }
  })

  it('takes createStore({ tombstoneGc }) when the plugin has no setting of its own', async () => {
    vi.useFakeTimers({ now: 10_000 })
    try {
      const { store, cache, todos, warnings } = await setup({
        plugins: [createMultiplayerPlugin()],
        tombstoneGc: { intervalMs: 100, ttlMs: 500 },
      })
      cache.deleteItem({ collection: todos, key: '1', metadata: { deletedAt: 1 } })
      await vi.advanceTimersByTimeAsync(100)

      expect(getTombstone(store, 'todos', '1')).toBeUndefined()
      expect(warnings('tombstoneGc')).toHaveLength(1)
    }
    finally {
      vi.useRealTimers()
    }
  })
})
