import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { describe, expect, it, vi } from 'vitest'

describe('cache', () => {
  const mockItem = { id: 1, name: 'Test Item' }

  it('should write an item to the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: mockItem })

    expect(store.TestCollection.peekFirst(1)).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should not write special keys', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: {
      ...mockItem,
      $special: true,
    } })

    expect(store.TestCollection.peekFirst(1)).toEqual({ id: 1, name: 'Test Item' })
  })

  it('should read an item from the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const result = cache.readItem({ collection, key: 1 })
    expect(result).toBeDefined()
    expect(result).toEqual(mockItem)
  })

  it('should return a wrapped item', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })

    const result = cache.readItem({ collection, key: 1 })
    expect(result?.$collection).toBe(collection.name)
  })

  it('should delete an item from the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: mockItem })
    cache.deleteItem({ collection, key: 1 })

    expect(store.TestCollection.peekFirst(1)).toBeNull()
    expect(store.TestCollection.peekMany()).toEqual([])
  })

  it('should apply a write mutation without emitting mutation hooks', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const afterMutation = vi.fn()
    store.$hooks.hook('afterMutation', afterMutation)

    const collection = store.$collections[0]!
    const result = store.$cache.applyMutation({
      collection,
      mutation: 'create',
      result: { id: 1, name: 'Created' },
    })

    expect(result).toEqual({ written: [1], deleted: [], skipped: 0 })
    expect(afterMutation).not.toHaveBeenCalled()
    expect(store.$cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Created' })
  })

  it('should apply input-only mutation items directly to cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const collection = store.$collections[0]!

    const result = store.$cache.applyMutation({
      collection,
      mutation: 'update',
      items: [{ id: 1, name: 'Updated' }],
    })

    expect(result).toEqual({ written: [1], deleted: [], skipped: 0 })
    expect(store.$cache.readItem({ collection, key: 1 })).toEqual({ id: 1, name: 'Updated' })
  })

  it('should apply a delete mutation', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const collection = store.$collections[0]!
    store.$cache.writeItem({ collection, key: 1, item: mockItem })

    const result = store.$cache.applyMutation({
      collection,
      mutation: 'delete',
      key: 1,
    })

    expect(result).toEqual({ written: [], deleted: [1], skipped: 0 })
    expect(store.$cache.readItem({ collection, key: 1 })).toBeUndefined()
  })

  it('should clear the cache', async () => {
    const store = await createStore({
      schema: [{ name: 'TestCollection' }],
      plugins: [],
    })
    const cache = store.$cache
    cache.writeItem({ collection: store.$collections[0]!, key: 1, item: mockItem })
    cache.clear()

    expect(store.TestCollection.peekMany()).toEqual([])
    expect(store.TestCollection.peekFirst(1)).toBeNull()
  })
})
