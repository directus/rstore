import type { CoreStack } from '#test-utils/store/coreStack'
import type { Plugin, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findMany, peekFirst, peekMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// `findFirst.spec.ts` / `findMany.spec.ts` used to `vi.mock` their own sibling
// `peekFirst` / `peekMany` and rebuild `wrapItem` as a hand-written proxy, so
// no marker, filter or wrapping regression could fail them. `peekFirst.spec.ts`
// / `peekMany.spec.ts` went further and stubbed `$cache.readItem` / `readItems`
// to hand back the very rows they then asserted. Everything here runs the real
// cache-read half.

/** Posts pointing at authors, so relation access can be asserted. */
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

/**
 * Core store with two authors and three posts on the fake backend.
 *
 * @param plugins Extra plugins, registered after the fake remote.
 */
function setup(plugins?: Plugin[]) {
  return createCoreStack({
    schema,
    plugins,
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
    },
  })
}

/** Runs `findMany` on a collection of the stack. */
function query(stack: CoreStack, collection: string, findOptions?: any) {
  return findMany({ store: stack.store, collection: stack.collection(collection), findOptions })
}

describe('cache-first on a warm cache', () => {
  it('issues no second request and returns real wrapped items', async () => {
    const stack = await setup()

    await query(stack, 'posts', { include: { author: true } })
    const requests = stack.remote.callCount('fetchMany', 'posts')

    const { result } = await query(stack, 'posts', { include: { author: true } })

    expect(stack.remote.callCount('fetchMany', 'posts')).toBe(requests)
    const first = result.find(post => post.id === 'p1')!
    // A real `wrapItem` proxy, not a test double: key resolution, metadata and
    // relation resolution all go through the cache.
    expect(first.$getKey()).toBe('p1')
    expect((first as any).author.name).toBe('Ada')
  })
})

describe('filter functions and cache markers', () => {
  it('narrows the read without changing the marker', async () => {
    const stack = await setup()

    await query(stack, 'posts')
    const requests = stack.remote.callCount('fetchMany', 'posts')

    // Two different filter functions over the same warm cache: the marker must
    // not embed them, or either read misses the cache and refetches everything
    // (regression for `384b3ba`).
    const ada = await query(stack, 'posts', { filter: (post: any) => post.author_id === 'a1' })
    const alan = await query(stack, 'posts', { filter: (post: any) => post.author_id === 'a2' })

    expect(ada.result.map(post => post.id)).toEqual(['p1', 'p2'])
    expect(alan.result.map(post => post.id)).toEqual(['p3'])
    expect(stack.remote.callCount('fetchMany', 'posts')).toBe(requests)
    expect(ada.marker).toBe(alan.marker)
  })
})

describe('dedupe', () => {
  it('shares one request between two identical in-flight queries', async () => {
    const stack = await setup()

    const [a, b] = await Promise.all([
      query(stack, 'posts', { params: { where: { author_id: 'a1' } }, fetchPolicy: 'fetch-only' }),
      query(stack, 'posts', { params: { where: { author_id: 'a1' } }, fetchPolicy: 'fetch-only' }),
    ])

    expect(stack.remote.callCount('fetchMany', 'posts')).toBe(1)
    expect(a.result.map(post => post.id)).toEqual(['p1', 'p2'])
    expect(b.result.map(post => post.id)).toEqual(['p1', 'p2'])
  })

  it('does not share a request between two different filter function references', async () => {
    const stack = await setup()

    // Two queries whose only difference is a function identity must not share
    // the in-flight promise (regression for `e52dedd`).
    await Promise.all([
      query(stack, 'posts', { filter: (post: any) => post.author_id === 'a1', fetchPolicy: 'fetch-only' }),
      query(stack, 'posts', { filter: (post: any) => post.author_id === 'a2', fetchPolicy: 'fetch-only' }),
    ])

    expect(stack.remote.callCount('fetchMany', 'posts')).toBe(2)
  })
})

describe('peekFirst through an optimistic layer', () => {
  it('finds a layer-only item by key and by filter', async () => {
    const stack = await setup()
    const collection = stack.collection('posts')
    // The `many` marker a filter peek falls back to is written by this query.
    await query(stack, 'posts')

    stack.cache.addLayer({
      id: 'draft-layer',
      collectionName: 'posts',
      state: {
        p9: { id: 'p9', title: 'Draft', author_id: 'a2', $overrideKey: 'p9' },
      },
      deletedItems: new Set(),
      optimistic: true,
    })

    const byKey = peekFirst({ store: stack.store, collection, findOptions: 'p9' })
    expect(byKey.result?.title).toBe('Draft')

    const byFilter = peekFirst({
      store: stack.store,
      collection,
      findOptions: { filter: (post: any) => post.title === 'Draft' },
    })
    expect(byFilter.result?.$getKey()).toBe('p9')
  })
})

describe('cache miss result shape', () => {
  // `peekFirst` used to hand back `store.$cache.readItem(...)` unchanged, so a
  // key miss read `undefined` while the filter branch ended in `?? null`,
  // though both are typed `WrappedItem | null`.
  it('reports a key-based miss as null, like a filter-based one', async () => {
    const stack = await setup()
    const collection = stack.collection('posts')

    expect(peekFirst({ store: stack.store, collection, findOptions: { filter: () => false } }).result).toBeNull()
    expect(peekFirst({ store: stack.store, collection, findOptions: 'missing' }).result).toBeNull()
  })
})

describe('peekMany on a warm cache', () => {
  it('reads every cached item, narrows with a filter, and answers a miss with an empty array', async () => {
    const stack = await setup()
    await query(stack, 'posts')
    const params = { store: stack.store, collection: stack.collection('posts') }

    expect(peekMany(params).result.map(post => post.id)).toEqual(['p1', 'p2', 'p3'])
    expect(peekMany({ ...params, findOptions: { filter: (post: any) => post.id === 'p2' } })
      .result.map(post => post.id)).toEqual(['p2'])
    expect(peekMany({ ...params, findOptions: { filter: () => false } }).result).toEqual([])
  })
})

describe('cache read hooks', () => {
  // `peekFirst.spec.ts` / `peekMany.spec.ts` asserted these hooks as
  // `expect(callHookSync).toHaveBeenCalledWith(name, expect.any(Object))`, green
  // as long as *something* is dispatched. `plugin-order.spec.ts:141` covers
  // `cacheFilterMany`; these three assert what the other hooks changed.
  it('narrows a cache read with the filter a beforeCacheReadMany hook sets', async () => {
    const stack = await setup([{
      name: 'only-alan',
      category: 'local',
      setup({ hook }: any) {
        hook('beforeCacheReadMany', ({ setFilter }: any) => setFilter((post: any) => post.author_id === 'a2'))
      },
    }])
    await query(stack, 'posts')

    // Every post is cached; only the hook's filter decides what a peek returns.
    expect(stack.readMany('posts').map(post => post.id)).toEqual(['p1', 'p2', 'p3'])
    expect(peekMany({ store: stack.store, collection: stack.collection('posts') })
      .result.map(post => post.id)).toEqual(['p3'])
  })

  it('reads with the marker a beforeCacheReadFirst hook sets', async () => {
    let override: string | undefined
    const stack = await setup([{
      name: 'marker-override',
      category: 'local',
      setup({ hook }: any) {
        hook('beforeCacheReadFirst', ({ setMarker }: any) => {
          if (override) {
            setMarker(override)
          }
        })
      },
    }])
    const collection = stack.collection('posts')
    // A query whose marker embeds `params`, so the marker a plain peek computes
    // cannot match it.
    const { marker } = await query(stack, 'posts', { params: { author_id: 'a1' } })
    const peek = () => peekFirst({
      store: stack.store,
      collection,
      findOptions: { filter: (post: any) => post.title === 'First' },
    }).result

    expect(peek()).toBeNull()
    override = marker
    expect(peek()?.id).toBe('p1')
  })

  it('lets a cacheFilterFirst hook answer a read the cache cannot resolve itself', async () => {
    const stack = await setup([{
      name: 'server-filter',
      category: 'local',
      setup({ hook }: any) {
        hook('cacheFilterFirst', (payload: any) => {
          if (payload.getResult()) {
            return
          }
          // `params` is opaque to the cache, so the plugin resolves it from the
          // marked items itself — what the directus and monospace plugins do.
          payload.setResult(payload.readItemsFromCache({
            applyFilter: (post: any) => post.title === payload.findOptions.params?.title,
          })[0] ?? null)
        })
      },
    }])
    await query(stack, 'posts', { params: { title: 'Third' } })

    const result = peekFirst({
      store: stack.store,
      collection: stack.collection('posts'),
      findOptions: { params: { title: 'Third' } },
    })

    expect(result.result?.id).toBe('p3')
  })
})

describe('resultMode', () => {
  it('reaches the plugin resolved, and the cache stays normalized either way', async () => {
    const stack = await setup()

    await query(stack, 'posts', { fetchPolicy: 'fetch-only' })
    expect(stack.remote.lastRequest('fetchMany', 'posts')!.findOptions.resultMode).toBe('computed')

    const { result } = await query(stack, 'posts', { resultMode: 'responseRefs', fetchPolicy: 'fetch-only' })

    expect(stack.remote.lastRequest('fetchMany', 'posts')!.findOptions.resultMode).toBe('responseRefs')
    expect(result.map(post => post.id)).toEqual(['p1', 'p2', 'p3'])
    // One normalized cache entry per key, whatever the result mode.
    expect(stack.readMany('posts').map(post => post.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('aborting hooks', () => {
  it('lets later plugins run when setResult passes abort: false', async () => {
    const stack = await createCoreStack({
      schema,
      plugins: [{
        name: 'placeholder',
        category: 'local',
        setup({ hook }: any) {
          hook('fetchMany', ({ setResult }: any) => {
            setResult([{ id: 'placeholder', title: 'Loading', author_id: 'a1' }], { abort: false })
          })
        },
      }],
      data: { posts: [{ id: 'p1', title: 'First', author_id: 'a1' }] },
    })

    const { result } = await query(stack, 'posts', { fetchPolicy: 'fetch-only' })

    // The remote still ran, and its answer replaced the placeholder.
    expect(stack.remote.callCount('fetchMany', 'posts')).toBe(1)
    expect(result.map(post => post.id)).toEqual(['p1'])
    expect(stack.read('posts', 'placeholder')).toBeUndefined()
  })
})
