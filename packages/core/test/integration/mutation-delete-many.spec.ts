import { createCoreStack } from '#test-utils/store/coreStack'
import { deleteMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { cachedKeys, holdPreventingCreate, loadManyMutationRows, setupManyMutationStack, silenceLayerError } from './utils/manyMutation'

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

  it('hides the items optimistically until the remote answers', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)
    const release = stack.remote.holdNext('deleteMany')
    const pending = deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })
    await vi.waitFor(() => expect(stack.remote.callCount('deleteMany')).toBe(1))

    expect(cachedKeys(stack)).toEqual(['3'])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2', '3'])

    release()
    await pending
    expect(cachedKeys(stack)).toEqual(['3'])
  })

  it('keeps the items visible when the remote fails, and leaves no layer behind', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)
    stack.remote.failNext('deleteMany')

    await expect(deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })).rejects.toThrow('fake-remote: deleteMany failed')

    expect(cachedKeys(stack)).toEqual(['1', '2', '3'])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2', '3'])
  })

  it('adds no layer and keeps the cached items with skipCache', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)
    const release = stack.remote.holdNext('deleteMany')
    const pending = deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
      skipCache: true,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('deleteMany')).toBe(1))

    release()
    await pending
    expect(cachedKeys(stack)).toEqual(['1', '2', '3'])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['3'])
  })

  it('does not hide the items before the remote answers when optimistic is false', async () => {
    const stack = await setup([{ id: '1' }, { id: '2' }, { id: '3' }])
    await load(stack)
    const release = stack.remote.holdNext('deleteMany')
    const pending = deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
      optimistic: false,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('deleteMany')).toBe(1))

    expect(cachedKeys(stack)).toEqual(['1', '2', '3'])

    release()
    await pending
    expect(cachedKeys(stack)).toEqual(['3'])
  })

  it('refuses the whole batch when any key is held by a preventing layer', async () => {
    silenceLayerError()
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    // The layer sits on the *second* key, so this also proves every key is
    // checked, not only the first.
    const finish = await holdPreventingCreate(stack, [{ id: '2', title: 'Held' }])

    await expect(deleteMany({
      store: stack.store,
      collection: stack.collection('todos'),
      keys: ['1', '2'],
    })).rejects.toThrow(/^Item deletion prevented by the layer: /)

    // Not even the key checked before the held one was deleted.
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2'])
    expect(stack.read('todos', '1')).toMatchObject({ title: 'One' })

    await finish()
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
