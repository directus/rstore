import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

// Relation resolution is covered per connector, but never at the core/vue
// level: nested includes, back-population of the opposite side and reads
// through an optimistic layer all go untested today.

/** Blog-shaped schema: authors -> posts -> comments, both directions. */
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
      comments: { many: true, to: { comments: { on: { post_id: 'id' } } } },
    },
  },
  {
    name: 'comments',
    relations: {
      post: { to: { posts: { on: { id: 'post_id' } } } },
    },
  },
]

/** Store seeded with two authors, three posts and two comments. */
function setup() {
  return createVueStack({
    schema,
    data: {
      authors: [
        { id: 'a1', name: 'Ada' },
        { id: 'a2', name: 'Alan' },
      ],
      posts: [
        { id: 'p1', title: 'First', author_id: 'a1' },
        { id: 'p2', title: 'Second', author_id: 'a1' },
        { id: 'p3', title: 'Third', author_id: 'a2' },
      ],
      comments: [
        { id: 'c1', body: 'Nice', post_id: 'p1' },
        { id: 'c2', body: 'Agreed', post_id: 'p1' },
      ],
    },
  })
}

describe('relation includes', () => {
  it('resolves a to-one relation and normalizes the target', async () => {
    const { store, remote } = await setup()

    const posts = await store.posts.findMany({ include: { author: true } })

    expect(posts.map((post: any) => post.author?.name)).toEqual(['Ada', 'Ada', 'Alan'])
    // Both authors are cached as their own items, not embedded copies.
    expect(store.authors.peekMany().map((author: any) => author.id).sort()).toEqual(['a1', 'a2'])
    expect(remote.callCount('fetchMany', 'authors')).toBe(1)
  })

  it('resolves a to-many relation', async () => {
    const { store } = await setup()

    const authors = await store.authors.findMany({ include: { posts: true } })

    const ada = authors.find((author: any) => author.id === 'a1')
    expect(ada.posts.map((post: any) => post.title).sort()).toEqual(['First', 'Second'])
  })

  it('resolves nested includes in one pass per level', async () => {
    const { store, remote } = await setup()

    const authors = await store.authors.findMany({
      include: { posts: { comments: true } },
    })

    const ada = authors.find((author: any) => author.id === 'a1')
    const first = ada.posts.find((post: any) => post.title === 'First')
    expect(first.comments.map((comment: any) => comment.body).sort()).toEqual(['Agreed', 'Nice'])
    // One request per relation target, not one per parent item.
    expect(remote.callCount('fetchMany', 'posts')).toBe(1)
    expect(remote.callCount('fetchMany', 'comments')).toBe(1)
  })

  it('back-populates the opposite relation into the cache', async () => {
    const { store } = await setup()

    // Fetching posts with their author caches both sides...
    await store.posts.findMany({ include: { author: true } })

    // ...so the reverse relation resolves from cache with no extra fetch.
    const ada = store.authors.peekFirst('a1')
    expect(ada.posts.map((post: any) => post.id).sort()).toEqual(['p1', 'p2'])
  })

  it('serves a second identical query from cache without refetching relations', async () => {
    const { store, remote } = await setup()

    await store.posts.findMany({ include: { author: true } })
    const before = remote.callCount('fetchMany')
    await store.posts.findMany({ include: { author: true } })

    expect(remote.callCount('fetchMany')).toBe(before)
  })

  it('reads relations through an optimistic layer', async () => {
    const { store, remote } = await setup()
    await store.authors.findMany({ include: { posts: true } })

    const release = remote.holdNext('createItem')
    const promise = store.posts.create({ id: 'p4', title: 'Fourth', author_id: 'a2' })
    await nextTick()

    const alan = store.authors.peekFirst('a2')
    expect(alan.posts.map((post: any) => post.title).sort()).toEqual(['Fourth', 'Third'])

    release()
    await promise
    expect(store.authors.peekFirst('a2').posts).toHaveLength(2)
  })

  it('throws on an unknown relation instead of silently ignoring it', async () => {
    const { store } = await setup()

    await expect(store.posts.findMany({ include: { nope: true } })).rejects.toThrow(/nope/)
  })
})
