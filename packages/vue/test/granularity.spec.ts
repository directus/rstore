import { describe, expect, it, vi } from 'vitest'
import { effectScope, watchEffect } from 'vue'
import { createStore } from '../src'

/**
 * These tests lock in the headline performance property of the engine bridge:
 * fine-grained signals mean a single-item field write only re-runs the reactive
 * scopes that actually read that item — not every live list query on the
 * collection (the old per-collection marker bumped on every write).
 */
describe('cache reactivity granularity', () => {
  it('a field write re-runs item readers but not list readers', async () => {
    const store = await createStore({
      schema: [{ name: 'Todo' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'a' }, marker: 'all' })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'b' }, marker: 'all' })

    const listSpy = vi.fn()
    const itemSpy = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      // Reads only the visible key set length -> tracks the list signal only.
      watchEffect(() => {
        listSpy(cache.readItems({ collection, marker: 'all' }).length)
      }, { flush: 'sync' })
      // Reads item 1's field -> tracks item 1's signal.
      watchEffect(() => {
        const item = cache.readItem({ collection, key: 1 })
        itemSpy(item ? (item as any).label : undefined)
      }, { flush: 'sync' })
    })

    expect(listSpy).toHaveBeenCalledTimes(1)
    expect(itemSpy).toHaveBeenCalledTimes(1)

    // Field edit to item 1: only the item reader should re-run.
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'changed' } })
    expect(itemSpy).toHaveBeenCalledTimes(2)
    expect(itemSpy).toHaveBeenLastCalledWith('changed')
    // The win: the list reader did NOT re-run on a single-item field write.
    expect(listSpy).toHaveBeenCalledTimes(1)

    // Inserting a new item changes the visible set: the list reader re-runs,
    // but the unrelated item-1 reader does not.
    cache.writeItem({ collection, key: 3, item: { id: 3, label: 'c' }, marker: 'all' })
    expect(listSpy).toHaveBeenCalledTimes(2)
    expect(itemSpy).toHaveBeenCalledTimes(2)

    scope.stop()
    cache.dispose()
  })

  it('a write to one item does not re-run readers of a different item', async () => {
    const store = await createStore({
      schema: [{ name: 'Todo' }],
      plugins: [],
    })
    const cache = store.$cache
    const collection = store.$collections[0]!

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'a' } })
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'b' } })

    const item1Spy = vi.fn()
    const item2Spy = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        item1Spy((cache.readItem({ collection, key: 1 }) as any)?.label)
      }, { flush: 'sync' })
      watchEffect(() => {
        item2Spy((cache.readItem({ collection, key: 2 }) as any)?.label)
      }, { flush: 'sync' })
    })

    expect(item1Spy).toHaveBeenCalledTimes(1)
    expect(item2Spy).toHaveBeenCalledTimes(1)

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'a2' } })
    expect(item1Spy).toHaveBeenCalledTimes(2)
    // Reader of item 2 is untouched by a write to item 1.
    expect(item2Spy).toHaveBeenCalledTimes(1)

    scope.stop()
    cache.dispose()
  })

  it('a write to one collection does not re-run list readers of another', async () => {
    const store = await createStore({
      schema: [{ name: 'Todo' }, { name: 'User' }],
      plugins: [],
    })
    const cache = store.$cache
    const todo = store.$collections.find(c => c.name === 'Todo')!
    const user = store.$collections.find(c => c.name === 'User')!

    cache.writeItem({ collection: todo, key: 1, item: { id: 1 }, marker: 'todos' })
    cache.writeItem({ collection: user, key: 1, item: { id: 1 }, marker: 'users' })

    const todoListSpy = vi.fn()
    const userListSpy = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        todoListSpy(cache.readItems({ collection: todo, marker: 'todos' }).length)
      }, { flush: 'sync' })
      watchEffect(() => {
        userListSpy(cache.readItems({ collection: user, marker: 'users' }).length)
      }, { flush: 'sync' })
    })

    expect(todoListSpy).toHaveBeenCalledTimes(1)
    expect(userListSpy).toHaveBeenCalledTimes(1)

    cache.writeItem({ collection: todo, key: 2, item: { id: 2 }, marker: 'todos' })
    expect(todoListSpy).toHaveBeenCalledTimes(2)
    // The User list reader is unaffected by a write to the Todo collection.
    expect(userListSpy).toHaveBeenCalledTimes(1)

    scope.stop()
    cache.dispose()
  })

  it('writing a related item re-runs a parent that reads the relation', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'Post',
          relations: {
            comments: {
              many: true,
              to: {
                Comment: {
                  on: { postId: 'id' },
                },
              },
            },
          },
        },
        {
          name: 'Comment',
        },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const post = store.$collections.find(c => c.name === 'Post')!
    const comment = store.$collections.find(c => c.name === 'Comment')!

    cache.writeItem({ collection: post, key: 1, item: { id: 1 } })
    cache.writeItem({ collection: comment, key: 1, item: { id: 1, postId: 1 } })

    const relationSpy = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        const p = cache.readItem({ collection: post, key: 1 }) as any
        relationSpy(p?.comments?.length)
      }, { flush: 'sync' })
    })

    expect(relationSpy).toHaveBeenCalledTimes(1)
    expect(relationSpy).toHaveBeenLastCalledWith(1)

    // Writing a new related comment must re-run the parent's relation reader
    // via the index-bucket signal.
    cache.writeItem({ collection: comment, key: 2, item: { id: 2, postId: 1 } })
    expect(relationSpy).toHaveBeenCalledTimes(2)
    expect(relationSpy).toHaveBeenLastCalledWith(2)

    scope.stop()
    cache.dispose()
  })

  it('frees an item signal + its engine subscription when the item is deleted', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'a' } })

    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        void (cache.readItem({ collection, key: 1 }) as any)?.label
      }, { flush: 'sync' })
    })

    const signals = (cache as any)._private.signals
    expect(signals.size().items).toBe(1)

    // The signal outlives the effect: nothing reclaims it implicitly.
    scope.stop()
    expect(signals.size().items).toBe(1)

    // Deleting the item drops its signal (and unsubscribes the engine observer).
    cache.deleteItem({ collection, key: 1 })
    expect(signals.size().items).toBe(0)

    cache.dispose()
  })

  it('disposes every signal on cache reset (clear)', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'a' }, marker: 'all' })

    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        void cache.readItems({ collection, marker: 'all' }).length
        void (cache.readItem({ collection, key: 1 }) as any)?.label
      }, { flush: 'sync' })
    })

    const signals = (cache as any)._private.signals
    expect(signals.size().items).toBe(1)
    expect(signals.size().lists).toBe(1)

    scope.stop()
    cache.clear()
    // onReset disposed every signal + its engine subscription.
    expect(signals.size()).toEqual({ items: 0, lists: 0, indexes: 0 })

    cache.dispose()
  })
})
