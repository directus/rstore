import { createTestStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'

// Breaking change 1 of 0.9: field LWW and tombstones need
// `createMultiplayerPlugin()`. Without it, stamps are opaque metadata nobody
// handles: writes overwrite, deletes leave nothing behind, and a dev warning
// names the ignored keys so the missing plugin is noticed.

/** Store without any plugin, with a spy on dev warnings. */
async function setup(options: Record<string, any> = {}) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const store = await createTestStore({ schema: [{ name: 'todos' }], plugins: [], ...options } as any) as any
  const todos = store.$collections[0]
  /** Committed row, through the public state snapshot. */
  const read = (key: string) => store.$cache.getState().collections.todos?.[key]
  return { store, cache: store.$cache, todos, read, warn }
}

describe('cache without the multiplayer plugin', () => {
  it('overwrites on stamped writes and warns once about the unhandled stamps', async () => {
    const { cache, todos, read, warn } = await setup()
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'New' }, metadata: { fieldTimestamps: { title: 20 } } })
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'Stale' }, metadata: { fieldTimestamps: { title: 10 } } })

    expect(read('1')?.title).toBe('Stale')
    expect(warn.mock.calls).toEqual([
      ['[rstore] cache write metadata "fieldTimestamps" for collection "todos" was not handled by any plugin'],
    ])
  })

  it('records no tombstone, so an older write brings a deleted row back', async () => {
    const { cache, todos, read, warn } = await setup()
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'Row' } })
    cache.deleteItem({ collection: todos, key: '1', metadata: { deletedAt: 20 } })
    cache.writeItem({ collection: todos, key: '1', item: { id: '1', title: 'Late' }, metadata: { fieldTimestamps: { title: 10 } } })

    expect(read('1')?.title).toBe('Late')
    expect(warn.mock.calls.map(([message]) => message)).toContain('[rstore] cache write metadata "deletedAt" for collection "todos" was not handled by any plugin')
  })

  it('ignores createStore({ tombstoneGc }) with a warning and starts no timer', async () => {
    vi.useFakeTimers()
    try {
      const { warn } = await setup({ tombstoneGc: { intervalMs: 100 }, syncImmediately: false })

      expect(vi.getTimerCount()).toBe(0)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('createMultiplayerPlugin'))
    }
    finally {
      vi.useRealTimers()
    }
  })
})
