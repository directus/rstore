import { findFirst, getMarker } from '@rstore/core'
import { cacheWriteEventHook } from '@rstore/vue'
import { describe, expect, it, onTestFinished } from 'vitest'
import { batchStack, TWO_TODOS } from './utils/batching'

describe('batched fetch dispatch', () => {
  it('routes each batched row back to the caller that asked for its key', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')

    const [first, second] = await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1' } }),
      findFirst({ store: stack.store, collection, findOptions: { key: '2' } }),
    ])

    // A swapped result would still be "an item", so assert which row each got.
    expect(first.result?.title).toBe('One')
    expect(second.result?.title).toBe('Two')
    expect(stack.remote.lastRequest('batchFetch')?.keys).toEqual(['1', '2'])
  })

  it('batches every keyed findFirst of a tick into one call', async () => {
    const stack = await batchStack({
      data: { todos: [...TWO_TODOS, { id: '3', title: 'Three' }] },
    })
    const collection = stack.collection('todos')

    await Promise.all(['1', '2', '3'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2', '3'])
  })

  it('does not fetch an op the batch already answered', async () => {
    const stack = await batchStack({
      data: { todos: TWO_TODOS },
      on: {
        // Answers key '1' only, leaving '2' to the individual `fetchFirst` tier.
        batchFetch: ctx => ctx.payload.operations
          .filter((operation: any) => operation.key === '1')
          .forEach((operation: any) => operation.setResult({ id: '1', title: 'Batched' })),
      },
    })
    const collection = stack.collection('todos')

    await Promise.all(['1', '2'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    // `flushFetch.ts` falls only the *unresolved* ops through: dropping that
    // filter refetches key '1' and overwrites the batched row.
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
    expect(stack.remote.lastRequest('fetchFirst')?.key).toBe('2')
    expect(stack.read('todos', '1')?.title).toBe('Batched')
    expect(stack.read('todos', '2')?.title).toBe('Two')
  })

  it('answers a batched miss with null, like the unbatched path', async () => {
    const stack = await batchStack({
      data: { todos: TWO_TODOS },
      on: {
        batchFetch: ctx => ctx.payload.operations.forEach((operation: any) => operation.setResult(undefined)),
      },
    })

    const { result } = await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    // The batched branch used to assign `batched.item` unconditionally, so a
    // miss came back as `undefined` while the unbatched path reported `null`.
    expect(result).toBeNull()
    // The row exists on the backend: only `setResult(undefined)` marking the op
    // resolved keeps the individual hook from finding it anyway.
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('writes the batched row under the marker the batch supplied', async () => {
    const stack = await batchStack({
      on: {
        batchFetch: ctx => ctx.payload.operations.forEach((operation: any) => operation.setResult(
          { id: operation.key, title: 'Tagged' },
          { marker: 'etag-abc' },
        )),
      },
    })

    await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    expect(stack.readMany('todos', { marker: getMarker('first', 'etag-abc') }).map(item => item.id)).toEqual(['1'])
    // A marker's only job is to be found again, so prove the read is actually
    // filtered rather than answering every marker.
    expect(stack.readMany('todos', { marker: getMarker('first', 'etag-other') })).toEqual([])
  })

  it('preserves the marker supplied by an individual fallback fetch', async () => {
    const stack = await batchStack({
      batch: false,
      data: { todos: [{ id: '1', title: 'One' }] },
      on: {
        fetchFirst: async (ctx) => {
          ctx.payload.setMarker('fallback-etag')
          return ctx.next()
        },
      },
    })
    const collection = stack.collection('todos')

    await findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } })
    const cached = await findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'cache-only' } })

    expect(cached.result?.title).toBe('One')
    expect(stack.readMany('todos', { marker: getMarker('first', 'fallback-etag') }).map(item => item.id)).toEqual(['1'])
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
  })

  it('publishes one cache write notification for a batched fetch', async () => {
    const stack = await batchStack({ data: { todos: [{ id: '1', title: 'One' }] } })
    const writes: Array<{ key?: string | number, operation: string }> = []
    const listener = cacheWriteEventHook.on((event) => {
      if (event.collection === stack.collection('todos')) {
        writes.push({ key: event.key, operation: event.operation })
      }
    })
    onTestFinished(listener.off)

    const result = await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    expect(result.result).toMatchObject({ id: '1', title: 'One' })
    expect(writes).toEqual([{ key: '1', operation: 'write' }])
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'One' })
    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
  })

  it('falls every op through to fetchFirst when no batchFetch answers', async () => {
    const stack = await batchStack({ batch: false, data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')

    await Promise.all(['1', '2'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    expect(stack.remote.requests('fetchFirst').map(call => call.key)).toEqual(['1', '2'])
    expect(stack.readMany('todos').map(item => item.title)).toEqual(['One', 'Two'])
  })

  it('rejects only the failing op of a fetch fall-through', async () => {
    const stack = await batchStack({
      batch: false,
      data: { todos: TWO_TODOS },
      on: {
        fetchFirst: (ctx) => {
          if (ctx.key === '2') {
            throw new Error('fetchFirst failed for 2')
          }
          return ctx.next()
        },
      },
    })
    const collection = stack.collection('todos')

    const settled = await Promise.allSettled(['1', '2'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    expect(settled.map(entry => entry.status)).toEqual(['fulfilled', 'rejected'])
    expect(stack.read('todos', '1')?.title).toBe('One')
    expect(stack.read('todos', '2')).toBeUndefined()
  })

  it('rejects every op a throwing batchFetch left unanswered', async () => {
    const stack = await batchStack({ data: { todos: TWO_TODOS } })
    const collection = stack.collection('todos')
    stack.remote.failNext('batchFetch')

    const settled = await Promise.allSettled(['1', '2'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    expect(settled.map(entry => entry.status)).toEqual(['rejected', 'rejected'])
    // A thrown batch is a failure, not a reason to retry op by op.
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
    expect(stack.readMany('todos')).toEqual([])
  })

  it('keeps a batch result when a later batchFetch error rejects unresolved siblings', async () => {
    const stack = await batchStack({
      data: { todos: TWO_TODOS },
      on: {
        batchFetch: (ctx) => {
          ctx.payload.operations[0].setResult({ id: '1', title: 'Batched' })
          throw new Error('batchFetch failed after first result')
        },
      },
    })
    const collection = stack.collection('todos')

    const settled = await Promise.allSettled(['1', '2'].map(key => findFirst({
      store: stack.store,
      collection,
      findOptions: { key },
    })))

    expect(settled.map(entry => entry.status)).toEqual(['fulfilled', 'rejected'])
    expect(settled[1]).toStrictEqual({
      status: 'rejected',
      reason: new Error('batchFetch failed after first result'),
    })
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'Batched' })
    expect(stack.read('todos', '2')).toBeUndefined()
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
  })

  it('keeps the first terminal fetch resolution when later calls disagree', async () => {
    const stack = await batchStack({
      on: {
        batchFetch: ({ payload }: any) => {
          const [operation] = payload.operations
          operation.setResult({ id: '1', title: 'First' })
          operation.setError(new Error('Late failure'))
          operation.setResult({ id: '1', title: 'Late result' })
        },
      },
    })

    const { result } = await findFirst({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { key: '1' },
    })

    expect(result).toMatchObject({ id: '1', title: 'First' })
    expect(stack.read('todos', '1')).toMatchObject({ title: 'First' })
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
  })
})
