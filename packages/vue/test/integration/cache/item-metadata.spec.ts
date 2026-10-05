import { hydrate } from '#test-utils/store/ssr'
import { describe, expect, it, vi } from 'vitest'
import { createObservedStore } from './extensionPoints'

/** Store with one `item` and one `detached` namespace holding an entry for posts/p1. */
async function createStoreWithMetadata(options: Record<string, any> = {}) {
  const stack = await createObservedStore(options)
  const { cache, posts } = stack
  cache.itemMetadata.register('test:item', { lifecycle: 'item' })
  cache.itemMetadata.register('test:detached', { lifecycle: 'detached' })
  cache.writeItem({ collection: posts, key: 'p1', item: { id: 'p1' } })
  cache.itemMetadata.write('test:item', 'posts', 'p1', { etag: 'a' })
  cache.itemMetadata.write('test:detached', 'posts', 'p1', { deletedAt: 1 })
  return stack
}

/** Reads both test namespaces for posts/p1. */
function readBoth(cache: any) {
  return [
    cache.itemMetadata.read('test:item', 'posts', 'p1'),
    cache.itemMetadata.read('test:detached', 'posts', 'p1'),
  ]
}

describe('item metadata lifecycle', () => {
  it('drops item entries and keeps detached entries on delete', async () => {
    const { cache, posts } = await createStoreWithMetadata()
    cache.deleteItem({ collection: posts, key: 'p1' })
    expect(readBoth(cache)).toEqual([undefined, { deletedAt: 1 }])
  })

  it('drops item entries and keeps detached entries on eviction', async () => {
    const { cache, posts } = await createStoreWithMetadata()
    cache.garbageCollect()
    expect(cache.readItem({ collection: posts, key: 'p1' })).toBeUndefined()
    expect(readBoth(cache)).toEqual([undefined, { deletedAt: 1 }])
  })

  it('drops every entry on clear', async () => {
    const { cache } = await createStoreWithMetadata()
    cache.clear()
    expect(readBoth(cache)).toEqual([undefined, undefined])
    expect(cache.itemMetadata.size('test:detached')).toBe(0)
  })

  it('drops every entry of the collection only on clearCollection', async () => {
    const { cache, posts } = await createStoreWithMetadata()
    cache.itemMetadata.write('test:detached', 'authors', 'a1', { deletedAt: 2 })
    cache.clearCollection({ collection: posts })
    expect(readBoth(cache)).toEqual([undefined, undefined])
    expect(Array.from(cache.itemMetadata.entries('test:detached'))).toEqual([
      { collection: 'authors', key: 'a1', value: { deletedAt: 2 } },
    ])
  })

  it('rejects a namespace registered again with other options', async () => {
    const { cache } = await createStoreWithMetadata()
    expect(() => cache.itemMetadata.register('test:item', { lifecycle: 'item' })).not.toThrow()
    expect(() => cache.itemMetadata.register('test:item', { lifecycle: 'detached' })).toThrow(/test:item/)
  })

  it('lists the registered namespaces with their resolved options, persistence included', async () => {
    const { cache } = await createStoreWithMetadata()
    cache.itemMetadata.register('test:persisted', { lifecycle: 'detached', serialize: false, persist: true })

    expect(cache.itemMetadata.namespaces()).toEqual([
      { name: 'test:item', lifecycle: 'item', serialize: true, persist: false },
      { name: 'test:detached', lifecycle: 'detached', serialize: true, persist: false },
      { name: 'test:persisted', lifecycle: 'detached', serialize: false, persist: true },
    ])
    expect(() => cache.itemMetadata.register('test:persisted', { lifecycle: 'detached', serialize: false })).toThrow(/test:persisted/)
  })
})

describe('item metadata across getState() / setState()', () => {
  it.each([0, 1, '1', '01', 'p1'])('restores serialized namespaces for key %j', async (key) => {
    const server = await createObservedStore({ isServer: true })
    server.cache.itemMetadata.register('test:item', { lifecycle: 'item' })
    server.cache.itemMetadata.register('test:local', { lifecycle: 'item', serialize: false })
    server.cache.writeItem({ collection: server.posts, key, item: { id: key } })
    server.cache.itemMetadata.write('test:item', 'posts', key, { etag: 'a' })
    server.cache.itemMetadata.write('test:local', 'posts', key, { secret: true })

    const client = await createObservedStore()
    client.cache.itemMetadata.register('test:item', { lifecycle: 'item' })
    client.cache.itemMetadata.register('test:local', { lifecycle: 'item', serialize: false })
    client.cache.itemMetadata.write('test:item', 'posts', 'stale', { etag: 'old' })
    const payload = server.cache.getState()
    hydrate(client.cache, payload)

    expect(Array.from(client.cache.itemMetadata.entries('test:item'))).toEqual([
      { collection: 'posts', key, value: { etag: 'a' } },
    ])
    expect(client.cache.itemMetadata.read('test:item', 'posts', key)).toEqual({ etag: 'a' })
    // Non-serialized namespaces stay on the server: they must not reach the payload.
    expect(payload.itemMetadata).not.toHaveProperty('test:local')
    expect(client.cache.itemMetadata.size('test:local')).toBe(0)
  })
})

describe('dispose hook', () => {
  it('fires once even when the cache is disposed twice', async () => {
    const { store, cache } = await createObservedStore()
    const dispose = vi.fn()
    store.$hooks.hook('dispose', dispose)

    cache.dispose()
    cache.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledWith({ store })
  })
})
