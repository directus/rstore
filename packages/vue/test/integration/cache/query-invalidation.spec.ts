import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { runInTestScope } from '#test-utils/store/vueApp'
import { describe, expect, it, vi } from 'vitest'

describe('cache', () => {
  it('should clear cached query refs and query meta on clear()', async () => {
    let items = [{ id: 1, name: 'Before' }]
    const fetchMany = vi.fn(() => items)
    const store = await createStore({
      schema: [{ name: 'TestCollection', hooks: { fetchMany } }],
      plugins: [],
    })
    const options = { fetchPolicy: 'cache-first' as const, resultMode: 'responseRefs' as const }
    const first = await runInTestScope(() => store.TestCollection.query(q => q.many(options)))
    expect(first.data.value.map((item: any) => item.name)).toEqual(['Before'])
    const fetches = fetchMany.mock.calls.length

    store.$cache.clear()
    items = [{ id: 2, name: 'After' }]
    const second = await runInTestScope(() => store.TestCollection.query(q => q.many(options)))

    expect(fetchMany.mock.calls.length).toBeGreaterThan(fetches)
    expect(second.data.value.map((item: any) => item.name)).toEqual(['After'])
  })

  it('should clear cached query refs on setState()', async () => {
    let items = [{ id: 1, name: 'Before' }]
    const fetchMany = vi.fn(() => items)
    const store = await createStore({
      schema: [{ name: 'TestCollection', hooks: { fetchMany } }],
      plugins: [],
    })
    const options = { fetchPolicy: 'cache-first' as const, resultMode: 'responseRefs' as const }
    const first = await runInTestScope(() => store.TestCollection.query(q => q.many(options)))
    expect(first.data.value.map((item: any) => item.name)).toEqual(['Before'])
    const fetches = fetchMany.mock.calls.length

    store.$cache.setState({
      collections: {
        TestCollection: {
          2: { id: 2, name: 'Restored' },
        },
      },
      markers: {},
      modules: {},
      queryMeta: {},
    })
    items = [{ id: 3, name: 'After' }]
    const second = await runInTestScope(() => store.TestCollection.query(q => q.many(options)))

    expect(fetchMany.mock.calls.length).toBeGreaterThan(fetches)
    expect(second.data.value.map((item: any) => item.name)).toEqual(['After'])
  })

  it('should invalidate cached many query refs for a collection on clearCollection', async () => {
    const queryOptions = { fetchPolicy: 'cache-first' as const, resultMode: 'responseRefs' as const }
    let messages = [{ id: 'before', text: 'Before' }]
    const fetchMany = vi.fn(() => messages)
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: {
            fetchMany,
          },
        },
      ],
      plugins: [],
    })
    const collection = store.$collections[0]!

    const firstQuery = await runInTestScope(() => store.messages.query(q => q.many(queryOptions)))

    expect(firstQuery.data.value.map((item: any) => item.text)).toEqual(['Before'])
    expect(fetchMany).toHaveBeenCalledTimes(1)

    messages = [{ id: 'after', text: 'After' }]
    store.$cache.clearCollection({ collection })

    const secondQuery = await runInTestScope(() => store.messages.query(q => q.many(queryOptions)))

    expect(fetchMany).toHaveBeenCalledTimes(2)
    expect(secondQuery.data.value.map((item: any) => item.text)).toEqual(['After'])
  })

  it('should invalidate cached first query refs for a collection on clearCollection', async () => {
    const queryOptions = { key: 'listing', fetchPolicy: 'cache-first' as const }
    let keyStorageItem = { key: 'listing', value: ['Before'] }
    const fetchFirst = vi.fn(() => keyStorageItem)
    const store = await createStore({
      schema: [
        {
          name: 'keyStorage',
          getKey: (item: any) => item.key,
          hooks: {
            fetchFirst,
          },
        },
      ],
      plugins: [],
    })
    const collection = store.$collections[0]!

    const firstQuery = await runInTestScope(() => store.keyStorage.query(q => q.first(queryOptions)))

    expect((firstQuery.data.value as any)?.value).toEqual(['Before'])
    expect(fetchFirst).toHaveBeenCalledTimes(1)

    keyStorageItem = { key: 'listing', value: ['After'] }
    store.$cache.clearCollection({ collection })

    const secondQuery = await runInTestScope(() => store.keyStorage.query(q => q.first(queryOptions)))

    expect(fetchFirst).toHaveBeenCalledTimes(2)
    expect((secondQuery.data.value as any)?.value).toEqual(['After'])
  })

  it('should keep unrelated collection query refs on clearCollection', async () => {
    const queryOptions = { fetchPolicy: 'cache-first' as const, resultMode: 'responseRefs' as const }
    let messages = [{ id: 'message-1', text: 'Before' }]
    let posts = [{ id: 'post-1', title: 'Before' }]
    const fetchMessages = vi.fn(() => messages)
    const fetchPosts = vi.fn(() => posts)
    const store = await createStore({
      schema: [
        {
          name: 'messages',
          hooks: { fetchMany: fetchMessages },
        },
        {
          name: 'posts',
          hooks: { fetchMany: fetchPosts },
        },
      ],
      plugins: [],
    })

    const firstMessages = await runInTestScope(() => store.messages.query(q => q.many(queryOptions)))
    const firstPosts = await runInTestScope(() => store.posts.query(q => q.many(queryOptions)))
    expect(firstMessages.data.value[0]?.text).toBe('Before')
    expect(firstPosts.data.value[0]?.title).toBe('Before')

    store.$cache.clearCollection({ collection: store.$collections[0]! })
    messages = [{ id: 'message-2', text: 'After' }]
    posts = [{ id: 'post-2', title: 'After' }]
    const secondMessages = await runInTestScope(() => store.messages.query(q => q.many(queryOptions)))
    const secondPosts = await runInTestScope(() => store.posts.query(q => q.many(queryOptions)))

    expect(fetchMessages).toHaveBeenCalledTimes(2)
    expect(secondMessages.data.value[0]?.text).toBe('After')
    expect(fetchPosts).toHaveBeenCalledTimes(1)
    expect(secondPosts.data.value[0]?.title).toBe('Before')
  })
})
