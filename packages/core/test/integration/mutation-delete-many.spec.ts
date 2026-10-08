import { createCoreStack } from '#test-utils/store/coreStack'
import { createMany, deleteMany, updateMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { cachedKeys, cachedTitles, loadManyMutationRows, setupManyMutationStack, silenceLayerError } from './utils/manyMutation'

const setup = setupManyMutationStack
const load = loadManyMutationRows

describe('deleteMany', () => {
  it('removes every key from the cache and from the backend', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)

    await deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })

    expect(cachedKeys(stack)).toEqual(['3'])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['3'])
    // The fake backend does not abort, so the per-key path runs as well.
    expect(stack.remote.callCount('deleteItem')).toBe(2)
  })

  it.each([
    { name: 'hides items optimistically until remote answers', options: {}, before: ['3'], after: ['3'] },
    { name: 'keeps cached items throughout skipCache deletion', options: { skipCache: true }, before: ['1', '2', '3'], after: ['1', '2', '3'] },
    { name: 'waits for remote before hiding items with optimistic:false', options: { optimistic: false }, before: ['1', '2', '3'], after: ['3'] },
  ])('$name', async ({ options, before, after }) => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)
    const release = stack.remote.holdNext('deleteMany')
    let settled = false
    let pending: Promise<void> | undefined
    try {
      pending = deleteMany({
        store: stack.store,
        collection: stack.collection('todos'),
        keys: ['1', '2'],
        ...options,
      })
      void pending.then(() => {
        settled = true
      }, () => {
        settled = true
      })
      await vi.waitFor(() => expect(stack.remote.callCount('deleteMany')).toBe(1))
      expect(settled, 'held deleteMany must remain pending').toBe(false)
      expect(cachedKeys(stack)).toEqual(before)
      expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2', '3'])
    }
    finally {
      release()
      if (pending) {
        await vi.waitFor(() => expect(settled, 'released deleteMany must settle').toBe(true))
        await pending
      }
    }
    expect(cachedKeys(stack)).toEqual(after)
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['3'])
  })

  it('restores every failed deletion, and lets later edits publish without a stale layer', async () => {
    const stack = await setup([
      { id: '1', title: 'One' },
      { id: '2', title: 'Two' },
      { id: '3', title: 'Unrelated' },
    ])
    await load(stack)
    stack.remote.failNext('deleteMany')

    await expect(deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })).rejects.toThrow('fake-remote: deleteMany failed')

    expect(cachedKeys(stack)).toEqual(['1', '2', '3'])
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two', 3: 'Unrelated' })
    expect(stack.remote.rows('todos')).toEqual([
      { id: '1', title: 'One' },
      { id: '2', title: 'Two' },
      { id: '3', title: 'Unrelated' },
    ])
    expect(stack.store.$mutationHistory).toEqual([])

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First recovered' }, { id: '2', title: 'Second recovered' }],
    })

    expect(cachedTitles(stack)).toEqual({ 1: 'First recovered', 2: 'Second recovered', 3: 'Unrelated' })
    expect(stack.remote.rows('todos')).toEqual([
      { id: '1', title: 'First recovered' },
      { id: '2', title: 'Second recovered' },
      { id: '3', title: 'Unrelated' },
    ])
    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.keys])).toEqual([['update', ['1', '2']]])
  })

  it('refuses the whole batch when any key is held by a preventing layer', async () => {
    silenceLayerError()
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    // The layer sits on the *second* key, so this also proves every key is
    // checked, not only the first.
    const release = stack.remote.holdNext('createMany')
    let settled = false
    let pending: ReturnType<typeof createMany> | undefined
    try {
      pending = createMany({ store: stack.store, collection: stack.collection('todos'), items: [{ id: '2', title: 'Held' }] })
      void pending.then(() => {
        settled = true
      }, () => {
        settled = true
      })
      await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))
      await expect(deleteMany({
        store: stack.store,
        collection: stack.collection('todos'),
        keys: ['1', '2'],
      })).rejects.toThrow(/^Item deletion prevented by the layer: /)

      // Not even the key checked before the held one was deleted.
      expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2'])
      expect(stack.read('todos', '1')).toMatchObject({ title: 'One' })
    }
    finally {
      release()
      if (pending) {
        await vi.waitFor(() => expect(settled, 'released preventing createMany must settle').toBe(true))
        await pending
      }
    }
  })

  it('records one delete entry in $mutationHistory, with the deleted keys', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }])

    await deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })

    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.keys]))
      .toEqual([['delete', ['1', '2']]])
  })

  it('dispatches beforeManyMutation and afterManyMutation with the deleted keys', async () => {
    const seen: Record<string, Array<string | number>> = {}
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1' }, { id: '2' }] },
      plugins: [{
        name: 'many-mutation-log',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ mutation, keys }: any) => {
            seen[`before:${mutation}`] = keys
          })
          hook('afterManyMutation', ({ mutation, keys }: any) => {
            seen[`after:${mutation}`] = keys
          })
        },
      }],
    })

    await deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })

    expect(seen).toEqual({ 'before:delete': ['1', '2'], 'after:delete': ['1', '2'] })
  })

  it('ignores afterMutation replacement results from the per-key fallback', async () => {
    const afterMutationKeys: Array<string | number | undefined> = []
    let afterManyResults: unknown[] | undefined
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      remote: false,
      plugins: [{
        name: 'fallback-delete-hooks',
        setup({ hook }: any) {
          hook('deleteItem', ({ abort }: any) => abort())
          hook('afterMutation', ({ key, setResult }: any) => {
            afterMutationKeys.push(key)
            setResult({ id: key, title: 'Ignored' })
          })
          hook('afterManyMutation', ({ getResult }: any) => {
            afterManyResults = getResult()
          })
        },
      }],
    })
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'One' } })
    stack.cache.writeItem({ collection, key: '2', item: { id: '2', title: 'Two' } })

    await deleteMany({ store: stack.store, collection, keys: ['1', '2'] })

    expect([...afterMutationKeys].sort()).toEqual(['1', '2'])
    expect(afterManyResults).toEqual([])
    expect(cachedKeys(stack)).toEqual([])
  })

  it('stops the per-key deleteItem calls when a deleteMany hook aborts', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1' }, { id: '2' }, { id: '3' }] },
      on: {
        deleteMany: (ctx) => {
          ctx.payload.abort()
          return ctx.next()
        },
      },
    })
    await load(stack)

    await deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })

    expect(stack.remote.callCount('deleteItem')).toBe(0)
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['3'])
    expect(cachedKeys(stack)).toEqual(['3'])
  })
})
