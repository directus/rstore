import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, mutate } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createRstoreDevtools } from '../src/runtime'

// Real Core lifecycle and Devtools history; shared remote substitutes only
// backend. Rewritten keys and reused metadata distinguish target identity from
// invocation identity. Assertions run after public operation settles.
describe('operation invocation identity', () => {
  it('preserves distinct IDs when shared metadata invocations settle in reverse order', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const meta = {}
    const gates = [createDeferred<void>(), createDeferred<void>()]
    const pending = gates.map((gate, index) => mutate(stack.store, {
      collection: stack.collection('todos'),
      mutation: 'update',
      meta,
      key: 'target',
      item: { title: `attempt-${index}` },
      skipCache: true,
    }, async () => {
      await gate.promise
      return { id: 'target', title: `result-${index}` }
    }))
    try {
      await vi.waitFor(() => expect(registration.history.page().entries.filter(entry => entry.phase === 'start')).toHaveLength(2))
      gates[1]!.resolve()
      await pending[1]
      gates[0]!.resolve()
      await pending[0]
      const entries = registration.history.page().entries.filter(entry => entry.operation === 'update')
      expect(entries.map(entry => entry.phase)).toEqual(['start', 'start', 'complete', 'complete'])
      expect(entries.map(entry => entry.operationId)).toEqual([1, 2, 2, 1])
      expect(entries.slice(2).map(entry => entry.result)).toEqual([
        { kind: 'object', entries: [['id', 'target'], ['title', 'result-1']] },
        { kind: 'object', entries: [['id', 'target'], ['title', 'result-0']] },
      ])
    }
    finally {
      for (const gate of gates)
        gate.resolve()
      await Promise.allSettled(pending)
    }
  })
  it('correlates failed custom mutation after beforeMutation replaces inferred key', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    stack.store.$hooks.hook('beforeMutation', ({ setItem }) => setItem({ id: 'rewritten' }))
    const failure = new Error('rewritten target refused')
    let remoteKey: unknown
    await expect(mutate(stack.store, {
      collection: stack.collection('todos'),
      mutation: 'update',
      item: { id: 'original' },
    }, async ({ key }) => {
      remoteKey = key
      throw failure
    })).rejects.toBe(failure)
    expect(remoteKey).toBe('rewritten')
    const entries = registration.history.page().entries.filter(entry => entry.operation === 'update')
    expect(entries.map(entry => [entry.phase, entry.key])).toEqual([['start', 'original'], ['error', 'rewritten']])
    expect(entries[0]!.operationId).toBeTypeOf('number')
    expect(entries[1]!.operationId).toBe(entries[0]!.operationId)
    expect(stack.store.$mutationHistory).toEqual([])
  })

  it('correlates rewritten fetch target and reports effective key on failure', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: [{ id: 'rewritten' }] } })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const replacement = { key: 'rewritten', fetchPolicy: 'fetch-only' as const }
    stack.store.$hooks.hook('beforeFetch', ({ updateFindOptions }) => updateFindOptions(replacement))
    const errors: unknown[] = []
    stack.store.$hooks.hook('fetchError', ({ key, findOptions }) => {
      errors.push([key, findOptions && 'key' in findOptions ? findOptions.key : undefined])
    })
    const run = () => findFirst({ store: stack.store, collection: stack.collection('todos'), findOptions: { key: 'original', fetchPolicy: 'fetch-only' } })
    expect((await run()).result).toMatchObject({ id: 'rewritten' })
    const successful = registration.history.page().entries.filter(entry => entry.operation === 'fetchFirst')
    expect(successful.map(entry => entry.key)).toEqual(['original', 'rewritten'])
    expect(successful[0]!.operationId).toBeTypeOf('number')
    const failure = new Error('rewritten fetch refused')
    stack.remote.failNext('fetchFirst', failure)
    await expect(run()).rejects.toBe(failure)
    expect(errors).toEqual([['rewritten', 'rewritten']])
    expect(successful[1]!.operationId).toBe(successful[0]!.operationId)
    expect(stack.remote.lastRequest('fetchFirst')?.key).toBe('rewritten')
  })

  it('keeps independent cache-only failure separate from completed fetch with reused metadata', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], data: { todos: [{ id: 'target' }] } })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const meta = {}
    await findFirst({ store: stack.store, meta, collection: stack.collection('todos'), findOptions: { key: 'target', fetchPolicy: 'fetch-only' } })
    const failure = new Error('independent cache read refused')
    stack.store.$hooks.hook('beforeCacheReadFirst', () => {
      throw failure
    })
    await expect(findFirst({ store: stack.store, meta, collection: stack.collection('todos'), findOptions: { key: 'target', fetchPolicy: 'cache-only' } })).rejects.toBe(failure)
    const entries = registration.history.page().entries.filter(entry => entry.operation === 'fetchFirst')
    expect(entries.map(entry => entry.phase)).toEqual(['start', 'complete', 'error'])
    expect(entries[0]!.operationId).toBeTypeOf('number')
    expect(entries[1]!.operationId).toBe(entries[0]!.operationId)
    expect(entries[2]!.operationId).toBeUndefined()
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
  })
})
