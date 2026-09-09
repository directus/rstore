import type { CoreStack } from '#test-utils/store/coreStack'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany, deleteItem, updateItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

// The core mutation paths used to run against a hand-written copy of
// `packages/vue/src/cache/mutations.ts` kept in `test/mutation/`. Everything
// here asserts what a cache *read* shows after the mutation, so a divergence
// between the real cache and core can no longer hide.

/** Core store with a `todos` collection and an empty fake backend. */
function setup(data: Record<string, Array<Record<string, any>>> = {}) {
  return createCoreStack({
    schema: [{ name: 'todos' }],
    data,
  })
}

/** Writes an item straight into the cache, bypassing the backend. */
function seedCache(stack: CoreStack, item: Record<string, any>) {
  stack.cache.writeItem({ collection: stack.collection('todos'), key: item.id, item })
}

describe('create', () => {
  it('writes the server result under the server-assigned key, not the sent item', async () => {
    const stack = await setup()
    stack.remote.respondNext('createItem', item => ({ ...item, id: 'server-1', reviewed: true }))

    const created = await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: 'local-1', title: 'New' } as any,
    })

    expect(created.id).toBe('server-1')
    // The optimistic layer keyed by the local id is gone, and the only cached
    // row is the one the server answered with.
    expect(stack.read('todos', 'local-1')).toBeUndefined()
    expect(stack.read('todos', 'server-1')).toMatchObject({ id: 'server-1', title: 'New', reviewed: true })
  })
})

describe('update', () => {
  it('merges the result into the cached item instead of replacing it', async () => {
    const stack = await setup()
    seedCache(stack, { id: '1', title: 'One', done: false, note: 'keep me' })
    // The backend has no such row, so it answers with exactly what it was
    // given: a partial item. Only a merging cache write keeps `note`.
    stack.remote.respondNext('updateItem', () => ({ id: '1', title: 'Renamed' }))

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'Renamed' } as any,
    })

    expect(stack.read('todos', '1')).toMatchObject({
      id: '1',
      title: 'Renamed',
      done: false,
      note: 'keep me',
    })
  })

  it('strips special props before the payload reaches the remote', async () => {
    const stack = await setup({ todos: [{ id: '1', title: 'One' }] })

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'Renamed', $custom: { dirty: true }, _$custom: 'x' } as any,
    })

    // `update.ts` runs `pickNonSpecialProps` before any hook sees the item.
    const sent = stack.remote.lastRequest('updateItem')!.item!
    expect(Object.keys(sent).some(key => key.startsWith('$') || key.startsWith('_$'))).toBe(false)
    expect(sent).toEqual({ id: '1', title: 'Renamed' })
  })

  it('applies nested field paths set by a beforeMutation hook', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      plugins: [{
        name: 'nested-writer',
        setup({ hook }: any) {
          hook('beforeMutation', ({ modifyItem }: any) => {
            modifyItem('profile.city', 'Paris')
          })
        },
      }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'One' } as any,
    })

    expect(stack.remote.lastRequest('updateItem')!.item).toMatchObject({ profile: { city: 'Paris' } })
    expect(stack.read('todos', '1')!.profile).toEqual({ city: 'Paris' })
  })
})

describe('delete', () => {
  it('removes the item so a later cache read misses', async () => {
    const stack = await setup({ todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] })
    seedCache(stack, { id: '1', title: 'One' })
    seedCache(stack, { id: '2', title: 'Two' })

    await deleteItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
    })

    expect(stack.read('todos', '1')).toBeUndefined()
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['2'])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['2'])
  })

  it('keeps the cached item with skipCache', async () => {
    const stack = await setup({ todos: [{ id: '1', title: 'One' }] })
    seedCache(stack, { id: '1', title: 'One' })

    await deleteItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      skipCache: true,
    })

    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', '1')).toMatchObject({ id: '1' })
  })
})

describe('many mutations with an unresolvable key', () => {
  it('writes the siblings of an item whose key cannot be resolved', async () => {
    const stack = await setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stack.remote.respondNext('createMany', () => [{ title: 'no key' }, { id: '2', title: 'Two' }])

    try {
      await createMany({
        store: stack.store,
        collection: stack.collection('todos'),
        items: [{ title: 'no key' }, { id: '2', title: 'Two' }] as any,
      })

      expect(stack.readMany('todos').map(item => item.id)).toEqual(['2'])
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Key is undefined for todos'))
    }
    finally {
      warn.mockRestore()
    }
  })

  it('counts the skipped items in the applyMutation result', async () => {
    const stack = await setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = stack.cache.applyMutation({
      collection: stack.collection('todos'),
      mutation: 'create',
      results: [{ id: '1' }, { title: 'no key' }, { id: '3' }] as any,
    })
    warn.mockRestore()

    // The `skipped` counter used to be proved only against the copy.
    expect(result).toEqual({ written: ['1', '3'], deleted: [], skipped: 1 })
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '3'])
  })
})

describe('$mutationHistory', () => {
  it('records one entry per operation, in order, with the resolved key', async () => {
    const stack = await setup()
    const collection = stack.collection('todos')
    stack.remote.respondNext('createItem', item => ({ ...item, id: 'server-1' }))

    await createItem({ store: stack.store, collection, item: { title: 'One' } as any })
    await updateItem({ store: stack.store, collection, key: 'server-1', item: { title: 'Two' } as any })
    await deleteItem({ store: stack.store, collection, key: 'server-1' })

    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.key])).toEqual([
      ['create', 'server-1'],
      ['update', 'server-1'],
      ['delete', 'server-1'],
    ])
  })
})

describe('parse and serialize round trip', () => {
  it('sends the serialized value and caches the parsed one', async () => {
    const stack = await createCoreStack({
      schema: [{
        name: 'events',
        fields: {
          startsAt: {
            parse: (value: string) => new Date(value),
            serialize: (value: Date) => value.toISOString(),
          },
        },
      }],
    })
    const startsAt = new Date('2024-03-01T10:00:00.000Z')

    await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: 'e1', startsAt } as any,
    })

    // The wire sees the serialized string...
    expect(stack.remote.rows('events')).toEqual([{ id: 'e1', startsAt: '2024-03-01T10:00:00.000Z' }])
    // ...while the cache holds the parsed value, through a real cache write.
    const cached = stack.read('events', 'e1')!
    expect(cached.startsAt).toBeInstanceOf(Date)
    expect((cached.startsAt as Date).toISOString()).toBe('2024-03-01T10:00:00.000Z')
  })
})
