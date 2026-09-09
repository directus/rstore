import type { CustomHookMeta } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

describe.each(['first', 'many'] as const)('%s background request lifetime', (method) => {
  it.each([false, true])('shares a held background fetch with a later caller and permits another read (fails: %s)', async (fails) => {
    const hook = method === 'first' ? 'fetchFirst' : 'fetchMany'
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
      on: { [hook]: async (ctx: any) => {
        ctx.payload.meta.total = 42
        return ctx.next()
      } },
    })
    const release = stack.remote.holdNext(hook)
    onTestFinished(release)
    const error = new Error('offline')
    if (fails) {
      stack.remote.failNext(hook, error)
    }
    /** Each caller has separate response metadata and identical find options. */
    const request = (meta: CustomHookMeta & { total: number } = { total: 0 }) => {
      const options = { store: stack.store, collection: stack.collection('todos'), meta }
      return method === 'first'
        ? findFirst({ ...options, findOptions: { key: '1', fetchPolicy: 'cache-and-fetch' } })
        : findMany({ ...options, findOptions: { fetchPolicy: 'cache-and-fetch' } })
    }
    const firstMeta = { total: 0 }
    const secondMeta = { total: 0 }
    // Awaiting the initial result must not wait for the held background fetch.
    const first = await request(firstMeta)
    await vi.waitFor(() => expect(stack.remote.callCount(hook)).toBe(1))
    const second = await request(secondMeta)
    expect(first.result).toEqual(method === 'first' ? null : [])
    expect(second.result).toEqual(first.result)
    expect(stack.remote.callCount(hook)).toBe(1)
    expect(stack.read('todos', '1')).toBeUndefined()

    if (fails) {
      // Observe both failures now, and retry in the caller's first rejection turn.
      const secondError = second.fetchPromise!.catch(caught => caught)
      const retry = first.fetchPromise!.catch((caught) => {
        expect(caught).toBe(error)
        return request()
      })
      release()
      const recovered = await retry
      expect(recovered).toBeDefined()
      await recovered!.fetchPromise
      expect(await secondError).toBe(error)
    }
    else {
      release()
      await Promise.all([first.fetchPromise, second.fetchPromise])
      expect(firstMeta.total).toBe(42)
      expect(secondMeta.total).toBe(42)
    }
    expect(stack.read('todos', '1')?.title).toBe('One')
    // Completion must release deduplication: a fresh read now sees the populated cache.
    const cached = await request()
    expect(cached.result).toMatchObject(method === 'first' ? { title: 'One' } : [{ title: 'One' }])
    expect(cached.fetchPromise).toBeUndefined()
    expect(stack.remote.callCount(hook)).toBe(fails ? 2 : 1)
  })
})
