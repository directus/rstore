import { createCoreStack } from '#test-utils/store/coreStack'
import { updateMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { cachedTitles, holdPreventingCreate, loadManyMutationRows, pluginOnlyStack, setupManyMutationStack, silenceLayerError } from './utils/manyMutation'

const setup = setupManyMutationStack
const load = loadManyMutationRows

describe('updateMany', () => {
  it('writes every updated item to the cache and to the backend', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)

    const result = await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })

    expect(result.map((item: any) => item.title)).toEqual(['First', 'Second'])
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'First' }, { id: '2', title: 'Second' }])
  })

  it('rejects before reaching the remote when an item has no key', async () => {
    const stack = await setup([{ id: '1', title: 'One' }])

    await expect(updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ title: 'Keyless' }] as any,
    })).rejects.toThrow('Item update failed: key is not defined')

    expect(stack.remote.callCount('updateMany')).toBe(0)
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }])
  })

  it('accepts a falsy key such as 0', async () => {
    const stack = await setup([{ id: 0, title: 'Zero' }])

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: 0, title: 'Updated' }] as any,
    })

    expect(stack.read('todos', 0)).toMatchObject({ title: 'Updated' })
    expect(stack.remote.rows('todos')).toEqual([{ id: 0, title: 'Updated' }])
  })

  it('refuses to update an item a preventing layer holds, and that write never lands', async () => {
    silenceLayerError()
    const stack = await setup([{ id: '1', title: 'One' }])
    await load(stack)
    // A real layer, created the way product code creates one.
    const finish = await holdPreventingCreate(stack, [{ id: '1', title: 'First' }])

    await expect(updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'Second' }] as any,
    })).rejects.toThrow(/^Item update prevented by the layer: /)

    // The second write never reached the cache, nor the remote.
    expect(stack.read('todos', '1')).toMatchObject({ title: 'First' })
    expect(stack.remote.callCount('updateMany')).toBe(0)

    await finish()
    expect(stack.read('todos', '1')).toMatchObject({ title: 'First' })
  })

  it('shows every optimistic item under its own key until the remote answers', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    const release = stack.remote.holdNext('updateMany')
    const pending = updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateMany')).toBe(1))

    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
  })

  it('applies the per-item optimistic overrides in item order', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    const release = stack.remote.holdNext('updateMany')
    const pending = updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
      optimistic: [{ title: 'Saving 1' }, { title: 'Saving 2' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateMany')).toBe(1))

    expect(cachedTitles(stack)).toEqual({ 1: 'Saving 1', 2: 'Saving 2' })

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
  })

  it('leaves the cache untouched with skipCache, but still reaches the backend', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
      skipCache: true,
    })

    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'First' }, { id: '2', title: 'Second' }])
  })

  it('writes nothing before the remote answers when optimistic is false', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    const release = stack.remote.holdNext('updateMany')
    const pending = updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
      optimistic: false,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateMany')).toBe(1))

    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
  })

  it('sends the serialized items, caches the parsed ones and never mutates the caller items', async () => {
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
      data: { events: [{ id: 'e1', startsAt: '2024-01-01T00:00:00.000Z' }] },
    })
    const startsAt = new Date('2024-03-01T10:00:00.000Z')
    const items = [{ id: 'e1', startsAt }]

    await updateMany({
      store: stack.store,
      collection: stack.collection('events'),
      items: items as any,
    })

    expect(stack.remote.rows('events')).toEqual([{ id: 'e1', startsAt: '2024-03-01T10:00:00.000Z' }])
    expect(stack.read('events', 'e1')!.startsAt).toBeInstanceOf(Date)
    expect(items[0]!.startsAt).toBe(startsAt)
  })

  it('sorts the result back into the input order', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    // The backend answers in the opposite order.
    stack.remote.respondNext('updateMany', (rows: any[]) => [...rows].reverse())

    const result = await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })

    expect(result.map((item: any) => item.id)).toEqual(['1', '2'])
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
  })

  it('merges a fallback updateItem result into the item already in the cache', async () => {
    const stack = await pluginOnlyStack([{
      name: 'single-updates',
      setup({ hook }: any) {
        // Only `updateItem` is answered, so `updateMany` falls through to the
        // per-item path with the peeked cache items still in `result`.
        hook('fetchMany', ({ setResult }: any) => setResult([{ id: '1', title: 'One', note: 'keep me' }]))
        hook('updateItem', ({ key, setResult }: any) => setResult({ id: key, title: 'Renamed' }))
      },
    }])
    await load(stack)

    const result = await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'Renamed' }] as any,
    })

    // `note` only survives because the single result is merged into the peeked
    // item rather than pushed next to it.
    expect(result[0]).toMatchObject({ id: '1', title: 'Renamed', note: 'keep me' })
  })

  it('falls back to updateItem per item when updateMany is not answered', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
      on: { updateMany: () => [] },
    })

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })

    expect(stack.remote.callCount('updateItem')).toBe(2)
    expect(cachedTitles(stack)).toEqual({ 1: 'First', 2: 'Second' })
  })

  it('stops the per-item path once updateMany answers', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })

    expect(stack.remote.callCount('updateMany')).toBe(1)
    expect(stack.remote.callCount('updateItem')).toBe(0)
  })

  it('lets a later plugin win when the first answers with abort: false', async () => {
    const stack = await pluginOnlyStack([
      {
        name: 'first',
        setup({ hook }: any) {
          hook('updateMany', ({ setResult }: any) => setResult([{ id: '1', title: 'First' }], { abort: false }))
        },
      },
      {
        name: 'second',
        setup({ hook }: any) {
          hook('updateMany', ({ setResult }: any) => setResult([{ id: '1', title: 'Second' }]))
        },
      },
    ])

    const result = await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }] as any,
    })

    expect(result.map((item: any) => item.title)).toEqual(['Second'])
    expect(cachedTitles(stack)).toEqual({ 1: 'Second' })
  })

  it('rollback leaves no residue after a partial failure', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
    await load(stack)
    stack.remote.failNext('updateMany')

    await expect(updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })).rejects.toThrow('fake-remote: updateMany failed')

    // `updateMany.ts:98` removes the layer on the failure path; without it the
    // optimistic titles stay visible forever.
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
  })

  it('records one update entry in $mutationHistory, with the updated keys', async () => {
    const stack = await setup([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }, { id: '2', title: 'Second' }] as any,
    })

    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.keys]))
      .toEqual([['update', ['1', '2']]])
  })
})
