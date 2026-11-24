import type { CacheScope } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { setupExactTodos } from './exact-todos'

const scope: CacheScope = { field: 'group', value: 'a' }

async function setup() {
  const stack = await setupExactTodos({
    schema: [{ name: 'todos', garbageCollection: { maxSize: 1 } }],
    data: { todos: [] },
  })
  const collection = stack.store.$collections[0]!
  collection.indexes.set('group', ['group'])
  const open = () => stack.store.todos.query(q => q.many({
    fetchPolicy: 'cache-and-fetch',
    cacheScope: scope,
  }))
  return { ...stack, collection, open }
}

describe('complete indexed scopes', () => {
  it('clears one authoritative empty partition while keeping another partition intact', async () => {
    const stack = await setup()
    let rows = [{ id: '1', group: 'a' }]
    stack.store.$hooks.hook('fetchMany', ({ setResult, findOptions }) => {
      if (findOptions?.cacheScope)
        setResult(rows, { completeScope: scope })
    })
    stack.cache.writeItem({ collection: stack.collection, key: '1', item: { id: '1', group: 'a' } })
    stack.cache.writeItem({ collection: stack.collection, key: '2', item: { id: '2', group: 'b' }, retain: true })
    const query = await stack.run(stack.open)
    await query.background.promise
    expect(query.data.value.map(row => row.id)).toEqual(['1'])
    expect(query.mainPage.cacheStatus).toBe('complete')
    rows = []
    await query.refresh()
    expect(query.mainPage.cacheStatus).toBe('complete')
    expect(query.data.value.map(row => row.id)).toEqual([])
    expect(stack.store.todos.peekFirst('1')).toBeFalsy()
    expect(stack.store.todos.peekFirst('2')?.id).toBe('2')
  })

  it('rejects a complete response racing a newer local write', async () => {
    const stack = await setup()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    stack.store.$hooks.hook('fetchMany', async ({ setResult, findOptions }) => {
      if (findOptions?.cacheScope) {
        started.resolve()
        await release.promise
        setResult([], { completeScope: scope })
      }
    })
    const query = stack.run(stack.open)
    try {
      await started.promise
      stack.cache.writeItem({ collection: stack.collection, key: '1', item: { id: '1', group: 'a' } })
    }
    finally {
      release.resolve()
      await query.background.promise
    }
    expect(query.background.error.value?.name).toBe('IncompleteCacheScopeError')
    expect(query.mainPage.cacheStatus).toBe('miss')
    expect(stack.store.todos.peekFirst('1')?.id).toBe('1')
  })

  it('fetches an incomplete bucket after GC evicts a required row', async () => {
    const stack = await setup()
    const rows = [{ id: '1', group: 'a' }, { id: '2', group: 'a' }]
    stack.store.$hooks.hook('fetchMany', ({ setResult, findOptions }) => {
      if (findOptions?.cacheScope)
        setResult(rows, { completeScope: scope })
    })
    const first = stack.scope(stack.open)
    await first.result.background.promise
    expect(first.result.data.value.map(row => row.id)).toEqual(['1', '2'])
    first.stop()
    stack.cache.garbageCollect()
    expect(stack.cache.scopes?.isComplete(stack.collection, scope)).toBe(false)

    const release = stack.remote.holdNext('fetchMany')
    const reopened = stack.run(stack.open)
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBeGreaterThan(0))
      expect(reopened.data.value).toEqual([])
      expect(reopened.mainPage.cacheStatus).toBe('miss')
    }
    finally {
      release()
      await reopened.background.promise
    }
    expect(reopened.data.value.map(row => row.id).sort()).toEqual(['1', '2'])
  })
})
