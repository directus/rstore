import type { CoreStack } from '#test-utils/store/coreStack'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst } from '@rstore/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
})

/** Builds a store whose public queries pass through the configured scheduler. */
async function setup(batching: { delay: number, maxWait?: number, maxSize?: number }): Promise<CoreStack> {
  return createCoreStack({
    schema: [{ name: 'todos' }],
    data: {
      todos: [1, 2, 3, 4].map(id => ({ id: String(id), title: `Todo ${id}` })),
    },
    batch: ['batchFetch'],
    batching,
  })
}

/** Starts one fetch-only query in an optional batch group. */
function fetch(stack: CoreStack, key: string, group?: string) {
  return findFirst({
    store: stack.store,
    collection: stack.collection('todos'),
    findOptions: {
      key,
      fetchPolicy: 'fetch-only',
      batch: group ? { group } : true,
    },
  })
}

describe('batch pacing', () => {
  it('starts a non-debounced delay at the first request', async () => {
    const stack = await setup({ delay: 20 })
    vi.useFakeTimers()

    const first = fetch(stack, '1')
    await vi.advanceTimersByTimeAsync(15)
    const second = fetch(stack, '2')
    await vi.advanceTimersByTimeAsync(5)
    await Promise.all([first, second])

    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.lastRequest('batchFetch')?.keys).toEqual(['1', '2'])
  })

  it('debounces from the latest request', async () => {
    const stack = await setup({ delay: 20, maxWait: 1_000 })
    vi.useFakeTimers()

    const first = fetch(stack, '1')
    await vi.advanceTimersByTimeAsync(15)
    expect(stack.remote.callCount('batchFetch')).toBe(0)

    const second = fetch(stack, '2')
    await vi.advanceTimersByTimeAsync(15)
    expect(stack.remote.callCount('batchFetch')).toBe(0)

    await vi.advanceTimersByTimeAsync(5)
    await Promise.all([first, second])
    expect(stack.remote.lastRequest('batchFetch')?.keys).toEqual(['1', '2'])
  })

  it('flushes at maxWait under sustained requests', async () => {
    const stack = await setup({ delay: 20, maxWait: 50 })
    vi.useFakeTimers()

    const pending = [fetch(stack, '1')]
    for (const key of ['2', '3', '4']) {
      await vi.advanceTimersByTimeAsync(15)
      pending.push(fetch(stack, key))
    }
    await vi.advanceTimersByTimeAsync(5)
    await Promise.all(pending)

    expect(stack.remote.callCount('batchFetch')).toBe(1)
    expect(stack.remote.lastRequest('batchFetch')?.keys).toEqual(['1', '2', '3', '4'])
  })

  it('applies maxSize per public batch group', async () => {
    const stack = await setup({ delay: 100, maxSize: 2 })
    vi.useFakeTimers()

    const groupA = fetch(stack, '1', 'A')
    const groupB = Promise.all([fetch(stack, '2', 'B'), fetch(stack, '3', 'B')])
    await groupB

    expect(stack.remote.requests('batchFetch').map(request => request.group)).toEqual(['B'])

    await vi.advanceTimersByTimeAsync(100)
    await groupA
    expect(stack.remote.requests('batchFetch').map(request => request.group).sort()).toEqual(['A', 'B'])
  })
})
