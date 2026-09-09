import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createMany } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { cachedKeys, cachedTitles, pluginOnlyStack, setupManyMutationStack } from './utils/manyMutation'

const setup = setupManyMutationStack

describe('createMany', () => {
  it('writes every created item to the cache and to the backend', async () => {
    const stack = await setup()

    const result = await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(result.map((item: any) => item.id)).toEqual(['1', '2'])
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
  })

  it('falls back to createItem, and to afterMutation, per item when createMany is not answered', async () => {
    const hookKeys: Array<string | number | undefined> = []
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      // An empty batch answer is a plugin declining the batch: `createMany.ts`
      // only aborts the per-item path when the result is non-empty.
      on: { createMany: () => [] },
      plugins: [{
        name: 'after-mutation-log',
        setup({ hook }: any) {
          hook('afterMutation', ({ key }: any) => {
            hookKeys.push(key)
          })
        },
      }],
    })

    await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(stack.remote.callCount('createItem')).toBe(2)
    expect([...hookKeys].sort()).toEqual(['1', '2'])
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
  })

  it('commits only non-null afterMutation fallback results', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      on: { createMany: () => [] },
      plugins: [{
        name: 'rewrite-fallback-results',
        setup({ hook }: any) {
          hook('afterMutation', ({ key, setResult }: any) => {
            setResult(key === '1'
              ? { id: '1', title: 'Rewritten' }
              : null)
          })
        },
      }],
    })

    const result = await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(result).toEqual([{ id: '1', title: 'Rewritten' }])
    expect(cachedTitles(stack)).toEqual({ 1: 'Rewritten' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Two' }])
  })

  it('keeps the fallback results in input order when the second item settles first', async () => {
    const secondCreated = createDeferred<void>()
    const releaseFirst = createDeferred<void>()
    // Never leave the gate closed, so a failure here cannot hang the run.
    onTestFinished(() => releaseFirst.resolve())
    // Each entry pairs the key, the source item and the result one
    // `afterMutation` call was given, so a mispaired trio is visible.
    const hookTrios: Array<Array<string | number | undefined>> = []
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      on: {
        createMany: () => [],
        createItem: async (ctx: any) => {
          // Reverse the settlement: the first item waits for the second one.
          if (ctx.item.id === '1') {
            await releaseFirst.promise
          }
          const created = await ctx.next()
          if (ctx.item.id === '2') {
            secondCreated.resolve()
          }
          return created
        },
      },
      plugins: [{
        name: 'after-mutation-log',
        setup({ hook }: any) {
          hook('afterMutation', ({ key, item, getResult }: any) => {
            hookTrios.push([key, item?.id, getResult()?.id])
          })
        },
      }],
    })

    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })
    // Surface preparation failures while waiting instead of leaving an unhandled rejection.
    await Promise.race([secondCreated.promise, pending])
    releaseFirst.resolve()
    const result = await pending

    expect(result.map((item: any) => item.id)).toEqual(['1', '2'])
    // Insertion order of the backend rows: the reversal really happened.
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['2', '1'])
    // Sorted, because the per-item hooks are dispatched concurrently.
    expect([...hookTrios].sort()).toEqual([['1', '1', '1'], ['2', '2', '2']])
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
  })

  it('stops the per-item path, and the per-item hooks, once createMany answers', async () => {
    const hookKeys: Array<string | number | undefined> = []
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      plugins: [{
        name: 'after-mutation-log',
        setup({ hook }: any) {
          hook('afterMutation', ({ key }: any) => {
            hookKeys.push(key)
          })
        },
      }],
    })

    await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    // The request count is the assertion: the batch hook aborted the rest.
    expect(stack.remote.callCount('createMany')).toBe(1)
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(hookKeys).toEqual([])
  })

  it('shows every optimistic item under its own key until the remote answers', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('createMany')
    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))

    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
    expect(stack.remote.rows('todos')).toEqual([])

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
  })

  it('merges the optimistic override over every item', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('createMany')
    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
      optimistic: { title: 'Saving' } as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))

    expect(cachedTitles(stack)).toEqual({ 1: 'Saving', 2: 'Saving' })

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
  })

  it('keys the optimistic layer by a generated id when the item carries none', async () => {
    const stack = await setup()
    stack.remote.respondNext('createMany', (items: any[]) => items.map((item, index) => ({ ...item, id: `server-${index + 1}` })))
    const release = stack.remote.holdNext('createMany')
    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ title: 'One' }, { title: 'Two' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))

    // Two entries under two distinct generated keys, not one entry that both
    // keyless items collapsed onto.
    const optimistic = stack.readMany('todos')
    expect(optimistic.map((item: any) => item.title)).toEqual(['One', 'Two'])
    expect(new Set(optimistic.map(item => item.$getKey())).size).toBe(2)
    expect(stack.read('todos', 'server-1')).toBeUndefined()

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 'server-1': 'One', 'server-2': 'Two' })
  })

  it('leaves the cache untouched with skipCache, but still reaches the backend', async () => {
    const stack = await setup()

    await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
      skipCache: true,
    })

    expect(cachedKeys(stack)).toEqual([])
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2'])
  })

  it('writes nothing before the remote answers when optimistic is false', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('createMany')
    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
      optimistic: false,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))

    expect(cachedKeys(stack)).toEqual([])

    release()
    await pending
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Two' })
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
    })
    const startsAt = new Date('2024-03-01T10:00:00.000Z')
    const items = [{ id: 'e1', startsAt }, { id: 'e2', startsAt }]

    await createMany({
      store: stack.store,
      collection: stack.collection('events'),
      items: items as any,
    })

    expect(stack.remote.lastRequest('createMany')!.items!.map((item: any) => item.startsAt))
      .toEqual(['2024-03-01T10:00:00.000Z', '2024-03-01T10:00:00.000Z'])
    expect(stack.read('events', 'e1')!.startsAt).toBeInstanceOf(Date)
    // `createMany.ts` serializes a clone, so the caller keeps its `Date`.
    expect(items[0]!.startsAt).toBe(startsAt)
  })

  it('rolls the optimistic layer back when the remote fails, leaving no residue', async () => {
    const stack = await setup()
    stack.remote.failNext('createMany')

    await expect(createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })).rejects.toThrow('fake-remote: createMany failed')

    expect(cachedKeys(stack)).toEqual([])
  })

  it('lets a later plugin win when the first answers with abort: false', async () => {
    const stack = await pluginOnlyStack([
      {
        name: 'first',
        setup({ hook }: any) {
          hook('createMany', ({ setResult }: any) => setResult([{ id: '1', title: 'First' }], { abort: false }))
        },
      },
      {
        name: 'second',
        setup({ hook }: any) {
          hook('createMany', ({ setResult }: any) => setResult([{ id: '2', title: 'Second' }]))
        },
      },
    ])

    const result = await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }] as any,
    })

    expect(result.map((item: any) => item.id)).toEqual(['2'])
    expect(cachedTitles(stack)).toEqual({ 2: 'Second' })
  })

  it('records one create entry in $mutationHistory, with the created keys', async () => {
    const stack = await setup()

    await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(stack.store.$mutationHistory.map(entry => [entry.operation, entry.keys]))
      .toEqual([['create', ['1', '2']]])
  })
})
