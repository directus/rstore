import { stringifyHLC } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, watchEffect } from 'vue'
import { createStore } from '../src'

/** Create deterministic serialized timestamps for CRDT writes. */
function timestamp(physical: number): string {
  return stringifyHLC({ physical, logical: 0, nodeId: 'test' })
}

describe('cache item cells', () => {
  it('keeps one wrapper fresh through accepted CRDT writes', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' }, fieldTimestamps: { label: timestamp(100) } })
    const retained = cache.readItem({ collection, key: 1 }) as any
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' }, fieldTimestamps: { label: timestamp(200) } })

    expect(retained.label).toBe('after')
    expect(reader).toHaveBeenLastCalledWith('after')
    scope.stop()
    cache.dispose()
  })

  it('keeps a detached layer wrapper live after layer removal', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'base' } })
    cache.addLayer({ id: 'edit', collectionName: 'Todo', state: { 1: { label: 'layer' } }, deletedItems: new Set() })
    const retained = cache.readItem({ collection, key: 1 }) as any
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.removeLayer('edit')
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    expect(retained.label).toBe('after')
    expect(reader).toHaveBeenLastCalledWith('after')
    scope.stop()
    cache.dispose()
  })

  it('reruns a retained wrapper once when deletion detaches its cell', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' } })
    const retained = cache.readItem({ collection, key: 1 }) as any
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.deleteItem({ collection, key: 1 })

    expect(reader).toHaveBeenCalledTimes(2)
    expect(retained.label).toBe('before')
    scope.stop()
    cache.dispose()
  })

  it('keeps a detached wrapper live after collection reset', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' } })
    const retained = cache.readItem({ collection, key: 1 }) as any
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.setState({ collections: { Todo: { 1: { id: 1, label: 'reset' } } }, markers: {}, modules: {}, queryMeta: {} })
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    expect(retained.label).toBe('after')
    expect(reader).toHaveBeenLastCalledWith('after')
    scope.stop()
    cache.dispose()
  })

  it('shares numeric and string aliases and refreshes an evicted identity', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'number' } })
    const retained = cache.readItem({ collection, key: 1 }) as any
    expect(cache.readItem({ collection, key: '1' })).toBe(retained)
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.writeItem({ collection, key: '1', item: { id: '1', label: 'string' } })

    expect(retained.label).toBe('string')
    expect(reader).toHaveBeenLastCalledWith('string')
    scope.stop()
    cache.dispose()
  })

  it('wakes a missing-item reader on ordinary insertion', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader((cache.readItem({ collection, key: 1 }) as any)?.label), { flush: 'sync' }))

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'inserted' } })

    expect(reader).toHaveBeenLastCalledWith('inserted')
    scope.stop()
    cache.dispose()
  })

  it('does not wake a missing-item watcher for another key', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(cache.readItem({ collection, key: 1 })), { flush: 'sync' }))

    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'other' } })
    expect(reader).toHaveBeenCalledTimes(1)

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'wanted' } })
    expect(reader).toHaveBeenCalledTimes(2)
    scope.stop()
    cache.dispose()
  })

  it('keeps list-created wrappers lazy until a field is read', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' } })
    const retained = cache.readItems({ collection })[0] as any

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    expect(retained.label).toBe('after')
    cache.dispose()
  })
})
