import type { CustomHookMeta } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findMany } from '@rstore/core'
import { describe, expect, it, onTestFinished } from 'vitest'

// Real Core queries, hooks and cache; only remote storage fails. Reversing the
// caller order after failure exposes leaked metadata links as retry failures.
describe('deduped query metadata survives retries', () => {
  it.each(['no-cache', 'cache-and-fetch'] as const)('reuses caller metadata after a rejected %s request', async (fetchPolicy) => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
    })
    const collection = stack.collection('todos')
    const firstMeta: CustomHookMeta = {}
    const secondMeta: CustomHookMeta = {}
    const failure = new Error('offline')
    stack.remote.failNext('fetchMany', failure)

    /** Execute a real query through the same public caller-owned metadata. */
    const request = (meta: CustomHookMeta) => findMany({
      store: stack.store,
      collection,
      findOptions: { fetchPolicy },
      meta,
    })
    const initial = [request(firstMeta), request(secondMeta)]
    const failures = fetchPolicy === 'cache-and-fetch'
      ? (await Promise.all(initial)).map(result => result.fetchPromise!)
      : initial
    const rejected = await Promise.allSettled(failures)
    expect(rejected).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ])
    expect(stack.readMany('todos')).toEqual([])

    // The former follower now starts the shared fetch. Neither metadata object
    // may keep a link to the other's previous failed response.
    const recovered = await Promise.all([request(secondMeta), request(firstMeta)])
    await expect(Promise.all(recovered.map(result => result.fetchPromise))).resolves.toEqual([undefined, undefined])
    expect([firstMeta.$resultVersion, secondMeta.$resultVersion]).toEqual([undefined, undefined])
    const rows = fetchPolicy === 'no-cache' ? recovered[0]!.result : stack.readMany('todos')
    expect(rows.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: '1', title: 'One' },
      { id: '2', title: 'Two' },
    ])
    expect(stack.remote.callCount('fetchMany')).toBe(2)
  })

  it('releases background metadata before an earlier caller retries from its rejection handler', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const firstMeta: CustomHookMeta = {}
    const secondMeta: CustomHookMeta = {}
    const failure = new Error('offline')
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    stack.remote.failNext('fetchMany', failure)
    /** Start a background query with metadata its caller may reuse on failure. */
    const request = (meta: CustomHookMeta) => findMany({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { fetchPolicy: 'cache-and-fetch' },
      meta,
    })
    const first = await request(firstMeta)
    // Register recovery before the follower exists: cleanup cannot depend on
    // the follower's rejection handler running before the leader's caller.
    const recovery = first.fetchPromise!.catch(async (error) => {
      expect(error).toBe(failure)
      const results = await Promise.all([request(secondMeta), request(firstMeta)])
      await Promise.all(results.map(result => result.fetchPromise))
    })
    const second = await request(secondMeta)
    const secondFailure = second.fetchPromise!.catch(error => error)
    release()
    await expect(recovery).resolves.toBeUndefined()
    expect(await secondFailure).toBe(failure)
    expect(stack.read('todos', '1')?.title).toBe('One')
    expect(stack.remote.callCount('fetchMany')).toBe(2)
  })

  it('supports caller metadata taking opposite roles in concurrent query groups', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
    })
    const firstMeta: CustomHookMeta = {}
    const secondMeta: CustomHookMeta = {}
    /** Distinct transport options create independent groups sharing caller metadata. */
    const request = (tag: string, meta: CustomHookMeta) => findMany({
      store: stack.store,
      collection: stack.collection('todos'),
      findOptions: { fetchPolicy: 'no-cache', params: { tag } },
      meta,
    })
    const results = await Promise.all([
      request('one', firstMeta),
      request('one', secondMeta),
      request('two', secondMeta),
      request('two', firstMeta),
    ])
    await expect(Promise.all(results.map(result => result.fetchPromise))).resolves.toEqual([undefined, undefined, undefined, undefined])
    expect(results.map(({ result }) => result.map(({ id, title }) => ({ id, title })))).toEqual([
      [{ id: '1', title: 'One' }],
      [{ id: '1', title: 'One' }],
      [{ id: '1', title: 'One' }],
      [{ id: '1', title: 'One' }],
    ])
    expect(stack.remote.callCount('fetchMany')).toBe(2)
  })
})
