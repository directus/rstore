import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real query/cache/mutation APIs execute against the shared fake backend.
// Negative computed results must follow later matching writes, while retained
// server misses and response-controlled membership keep their own authority.
describe('negative first results follow computed cache membership', () => {
  it.each(['explicit', 'default'] as const)('preserves a keyed miss with %s pagination options', async (mode) => {
    const { store, run, payloads } = await setupLiveTodos({
      experimentalGarbageCollection: false,
      ...(mode === 'default' ? { findDefaults: { pageSize: 1 } } : {}),
    })
    const query = await run(() => store.todos.liveQuery((q: any) => q.first(mode === 'default' ? '1' : { key: '1', pageSize: 1 })))
    const sibling = await run(() => store.todos.query((q: any) => q.first('2')))
    const payload = await subscription(payloads)
    expect(query.data.value?.title).toBe('One')

    expect(payload.setResult!(null)).toBe('applied')
    expect(query.data.value).toBeNull()
    expect(query.mainPage.data).toBeNull()
    expect(query.confirmed.value).toBe(true)
    expect(store.todos.peekFirst('1')?.title).toBe('One')
    expect(sibling.data.value?.title).toBe('Two')

    store.todos.writeItem({ id: '2', title: 'Updated two' })
    expect(query.data.value).toBeNull()
    store.todos.writeItem({ id: '1', title: 'Updated one' })
    expect(query.data.value?.title).toBe('Updated one')
    expect(sibling.data.value?.title).toBe('Updated two')
  })

  it('shows newly created rows in mounted and remounted cache-first queries', async () => {
    const { store, run, remote } = await setupLiveTodos({
      data: { todos: [] },
      experimentalGarbageCollection: false,
    })
    const first = await run(() => store.todos.query((q: any) => q.first('1')))
    const second = await run(() => store.todos.query((q: any) => q.first('2')))
    expect(first.data.value).toBeNull()
    expect(second.data.value).toBeNull()

    await store.todos.create({ id: '2', title: 'Created two' })
    expect(first.data.value).toBeNull()
    expect(second.data.value?.title).toBe('Created two')
    await store.todos.create({ id: '1', title: 'Created one' })
    expect(first.data.value?.title).toBe('Created one')
    expect(first.mainPage.data?.title).toBe('Created one')
    expect(first.confirmed.value).toBe(true)
    expect(second.data.value?.title).toBe('Created two')

    const remounted = await run(() => store.todos.query((q: any) => q.first('1')))
    expect(remounted.data.value?.title).toBe('Created one')
    expect(remounted.confirmed.value).toBe(true)
    expect(first.mainPage.data?.title).toBe('Created one')
    expect(remote.rows('todos')).toEqual([
      { id: '2', title: 'Created two' },
      { id: '1', title: 'Created one' },
    ])
  })

  it.each([
    ['computed', 'cache-first', true],
    ['responseRefs', 'cache-first', false],
    ['computed', 'no-cache', false],
  ] as const)('preserves pushed absence until matching writes under %s/%s', async (resultMode, fetchPolicy, followsCache) => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.first({ key: '1', resultMode, fetchPolicy })))
    const payload = await subscription(payloads)
    expect(payload.setResult!(null)).toBe('applied')
    expect(query.data.value).toBeNull()

    store.todos.writeItem({ id: '2', title: 'Unrelated two' })
    await nextTick()
    expect(query.data.value).toBeNull()
    store.todos.writeItem({ id: '1', title: 'Updated one' })
    await nextTick()
    expect(store.todos.peekFirst('1')?.title).toBe('Updated one')
    if (followsCache)
      expect(query.data.value?.title).toBe('Updated one')
    else
      expect(query.data.value).toBeNull()
    expect(query.confirmed.value).toBe(true)
    expect(query.mainPage.data).toEqual(query.data.value)
  })
})
