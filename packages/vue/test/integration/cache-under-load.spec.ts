import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// `cache.spec.ts` drives the cache API directly, one call at a time. What it
// cannot reach is the cache *under a store*: a pause during an in-flight
// fetch, staggered writes racing a read, a layer overlapping a background
// fetch, and eviction while a query still holds items.

/** Authors and posts, so relation reads go through the `author_id` index. */
const schema: StoreSchema = [
  {
    name: 'authors',
    relations: {
      posts: { many: true, to: { posts: { on: { author_id: 'id' } } } },
    },
  },
  {
    name: 'posts',
    relations: {
      author: { to: { authors: { on: { id: 'author_id' } } } },
    },
  },
]

/** Backend rows every test starts from: the first two posts belong to `a1`. */
function rows(postCount = 3) {
  return {
    authors: [
      { id: 'a1', name: 'Ada' },
      { id: 'a2', name: 'Alan' },
    ],
    posts: Array.from({ length: postCount }, (_, index) => ({
      id: `p${index + 1}`,
      title: `Post ${index + 1}`,
      author_id: index < 2 ? 'a1' : 'a2',
    })),
  }
}

/** Store with the blog schema, backed by the fake remote. */
function setup(options: Record<string, any> = {}, data = rows()) {
  return createVueStack({ schema, data, ...options })
}

/** Title a query currently shows for a post. */
function titleOf(query: any, id: string) {
  return query.data.value.find((post: any) => post.id === id)?.title
}

/** Ids a query currently shows, in order. */
function idsOf(query: any) {
  return query.data.value.map((post: any) => post.id)
}

/**
 * Asserts that every visible post carries all the fields it was fetched with.
 *
 * A staggered write publishes whole items, so a read landing between two
 * batches may see fewer items but never a half-filled one.
 */
function expectWholePosts(posts: any[]) {
  for (const post of posts) {
    expect(post.title).toBe(`Post ${String(post.id).slice(1)}`)
    expect(post.author_id).toBeTruthy()
  }
}

describe('cache pause during an in-flight fetch', () => {
  it('queues the fetch result and flushes it in order on resume', async () => {
    const { store, run, remote } = await setup()
    const collection = store.$collections.find((c: any) => c.name === 'posts')!

    store.$cache.pause()
    const query = await run(() => store.posts.query((q: any) => q.many()))
    // The fetch settled, but nothing reached the cache yet.
    expect(query.loading.value).toBe(false)
    expect(query.data.value).toEqual([])

    // Queued behind the fetch result, so it has to be applied after it.
    store.$cache.writeItem({ collection, key: 'p1', item: { id: 'p1', title: 'Renamed' } })

    store.$cache.resume()
    await nextTick()

    expect(query.data.value).toHaveLength(3)
    expect(titleOf(query, 'p1')).toBe('Renamed')
    // Resuming publishes the queued result; it does not fetch again.
    expect(remote.callCount('fetchMany', 'posts')).toBe(1)
    expect(query.loading.value).toBe(false)
  })
})

describe('staggered cache writes', () => {
  it('publishes a large fetch in batches and never shows a partially written item', async () => {
    const { store, run } = await setup({ cacheStaggering: 2 }, rows(8))

    const query = await run(() => store.posts.query((q: any) => q.many()))

    // The fetch resolved, but only the first staggering budget was written.
    const firstBatch = query.data.value.length
    expect(firstBatch).toBeGreaterThan(0)
    expect(firstBatch).toBeLessThan(8)
    expectWholePosts(query.data.value)

    await vi.waitFor(() => {
      expectWholePosts(query.data.value)
      expect(query.data.value).toHaveLength(8)
    })
  })
})

describe('optimistic layer during a background fetch', () => {
  it('survives the fetch write and removes only its own layer on settle', async () => {
    const { store, run, remote } = await setup()
    const query = await run(() => store.posts.query((q: any) => q.many()))

    const releaseFirst = remote.holdNext('updateItem')
    const first = store.posts.update({ id: 'p1', title: 'Committed 1' }, { optimistic: { title: 'Optimistic 1' } })
    await vi.waitFor(() => expect(remote.callCount('updateItem')).toBe(1))
    const releaseSecond = remote.holdNext('updateItem')
    const second = store.posts.update({ id: 'p2', title: 'Committed 2' }, { optimistic: { title: 'Optimistic 2' } })
    await vi.waitFor(() => expect(remote.callCount('updateItem')).toBe(2))

    expect(titleOf(query, 'p1')).toBe('Optimistic 1')
    expect(titleOf(query, 'p2')).toBe('Optimistic 2')

    // A whole page lands from the server while both layers are open.
    remote.seed('posts', [
      { id: 'p1', title: 'Server 1', author_id: 'a1' },
      { id: 'p2', title: 'Server 2', author_id: 'a1' },
      { id: 'p3', title: 'Server 3', author_id: 'a2' },
    ])
    await query.refresh()

    expect(titleOf(query, 'p3')).toBe('Server 3')
    expect(titleOf(query, 'p1')).toBe('Optimistic 1')
    expect(titleOf(query, 'p2')).toBe('Optimistic 2')

    releaseFirst()
    await first
    await nextTick()

    // Exactly one layer went away: the second still overrides its own item.
    expect(titleOf(query, 'p1')).toBe('Committed 1')
    expect(titleOf(query, 'p2')).toBe('Optimistic 2')

    releaseSecond()
    await second
    await nextTick()

    expect(titleOf(query, 'p2')).toBe('Committed 2')
  })
})

describe('clearCollection with two open queries', () => {
  it('empties both queries and drops their query state so the next read refetches', async () => {
    const { store, run, remote } = await setup()
    const collection = store.$collections.find((c: any) => c.name === 'posts')!

    const all = await run(() => store.posts.query((q: any) => q.many()))
    const mine = await run(() => store.posts.query((q: any) => q.many({
      params: { where: { author_id: 'a1' } },
      filter: (post: any) => post.author_id === 'a1',
    })))
    expect(idsOf(all)).toEqual(['p1', 'p2', 'p3'])
    expect(idsOf(mine)).toEqual(['p1', 'p2'])

    const before = remote.callCount('fetchMany', 'posts')
    store.$cache.clearCollection({ collection })
    await nextTick()

    expect(all.data.value).toEqual([])
    expect(mine.data.value).toEqual([])

    // Regression for `0ae8b59`: the page refs of the cleared queries used to
    // survive, so a query reopened with the same options replayed them and
    // never asked the server again.
    const reopened = await run(() => store.posts.query((q: any) => q.many()))
    expect(remote.callCount('fetchMany', 'posts')).toBe(before + 1)
    expect(idsOf(reopened)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('index maintenance seen through a query', () => {
  it('drops an item from its index bucket when the indexed field is nulled', async () => {
    const { store, run } = await setup()
    const author = await run(() => store.authors.query((q: any) => q.first('a1')))
    await store.posts.findMany()

    expect(author.data.value.posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])

    await store.posts.update({ id: 'p1', author_id: null })
    await nextTick()

    // Regression for `6a33de8`: an explicit `null` used to fall back to the
    // previous value, putting the item straight back into its old bucket.
    expect(author.data.value.posts.map((post: any) => post.id)).toEqual(['p2'])
  })
})

describe('wrapped item identity', () => {
  it('shares one wrapped instance between queries and keeps it across a refetch', async () => {
    const { store, run, remote } = await setup()

    const one = await run(() => store.posts.query((q: any) => q.first('p1')))
    const list = await run(() => store.posts.query((q: any) => q.many()))
    const wrapped = list.data.value.find((post: any) => post.id === 'p1')

    expect(one.data.value).toBe(wrapped)

    remote.seed('posts', [
      { id: 'p1', title: 'Renamed', author_id: 'a1' },
      { id: 'p2', title: 'Post 2', author_id: 'a1' },
      { id: 'p3', title: 'Post 3', author_id: 'a2' },
    ])
    await list.refresh()
    await nextTick()

    expect(list.data.value.find((post: any) => post.id === 'p1')).toBe(wrapped)
    expect(wrapped.title).toBe('Renamed')
    expect(one.data.value.title).toBe('Renamed')
  })
})
