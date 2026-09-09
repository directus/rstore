import type { VueStack } from '#test-utils/store/vueStack'
import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { drainGarbageCollection } from '../garbage-collection/utils'

// A page loaded with `no-cache` writes nothing to the cache, so it cannot be
// represented by a cache slice while the other pages still are. These cover
// pages of one query resolving to different fetch policies.

const schema: StoreSchema = [{ name: 'items' }]

/** `count` rows, `1` … `N`, titled after their id. */
function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${index + 1}`,
    title: `Item ${index + 1}`,
  }))
}

/** Ids held by a page, a query result or a cache read. */
function ids(source: any): string[] {
  const value = Array.isArray(source) ? source : source?.value ?? []
  return value.map((item: any) => item.id)
}

/** Titles held by a page or a query result. */
function titles(source: any): string[] {
  const value = Array.isArray(source) ? source : source?.value ?? []
  return value.map((item: any) => item.title)
}

/** Ids of every page of a query, in page order. */
function pageIds(query: any): string[][] {
  return query.pages.value.map((page: any) => page && ids(page.data))
}

/**
 * Plugin resolving the second page to `no-cache` while `isUncached` says so.
 *
 * The policy comes from a hook, as a connector deciding per page would, so the
 * page options alone never carry it.
 *
 * @param isUncached Whether the second page currently skips the cache.
 */
function uncachedSecondPage(isUncached: () => boolean) {
  return {
    name: 'no-cache-second-page',
    setup({ hook }: any) {
      hook('resolveFindOptions', ({ findOptions, updateFindOptions }: any) => {
        if (isUncached() && findOptions.pageIndex === 1) {
          updateFindOptions({ fetchPolicy: 'no-cache' })
        }
      })
    },
  }
}

/**
 * Opens a cache-computed paginated query on `items`.
 *
 * @param stack The stack owning the query scope.
 * @param options Find options merged into the query ones.
 */
function paginate(stack: VueStack, options: Record<string, any> = {}) {
  return stack.run(() => stack.store.items.query((q: any) => q.many({
    fetchPolicy: 'fetch-only',
    resultMode: 'computed',
    pageIndex: 0,
    pageSize: 1,
    ...options,
  })))
}

describe('a secondary page loaded with no-cache', () => {
  it('publishes its rows without writing them to the cache', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(2) } })
    const query = await paginate(stack)

    const { page } = await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })

    expect(ids(page.data)).toEqual(['2'])
    expect(pageIds(query)).toEqual([['1'], ['2']])
    expect(ids(query.data)).toEqual(['1', '2'])
    // The row of a `no-cache` page is precisely what must not be cached.
    expect(ids(stack.readMany('items'))).toEqual(['1'])
  })

  it('keeps a later cached page addressable across the uncached one', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(3) } })
    const query = await paginate(stack)

    await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await query.fetchMore({ pageIndex: 2 })

    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(ids(query.data)).toEqual(['1', '2', '3'])
    expect(ids(stack.readMany('items'))).toEqual(['1', '3'])
  })

  it('honours a policy resolved from defaults and hooks instead of page options', async () => {
    const stack = await createVueStack({
      schema,
      data: { items: rows(3) },
      findDefaults: { fetchPolicy: 'fetch-only', pageSize: 1, resultMode: 'computed' },
      plugins: [uncachedSecondPage(() => true)],
    })
    const query = await stack.run(() => stack.store.items.query((q: any) => q.many({ pageIndex: 0 })))

    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })

    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(ids(query.data)).toEqual(['1', '2', '3'])
    expect(ids(stack.readMany('items'))).toEqual(['1', '3'])
  })
})

describe('a cached page reloaded with no-cache', () => {
  it('shows the fresh rows without updating the cache', async () => {
    let secondPageIsUncached = false
    const stack = await createVueStack({
      schema,
      data: { items: rows(3) },
      plugins: [uncachedSecondPage(() => secondPageIsUncached)],
    })
    const query = await paginate(stack)
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })
    expect(ids(query.data)).toEqual(['1', '2', '3'])

    // The page was a cache slice; its next load may no longer be one.
    secondPageIsUncached = true
    stack.remote.seed('items', rows(3).map(item => ({ ...item, title: `${item.title} v2` })))
    await query.refresh()

    expect(titles(query.pages.value[1].data)).toEqual(['Item 2 v2'])
    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    // The row appears once, from the page that fetched it.
    expect(titles(query.data)).toEqual(['Item 1 v2', 'Item 2 v2', 'Item 3 v2'])
    // The stale cached row is left untouched: a no-cache page writes nothing.
    expect(titles(stack.readMany('items'))).toEqual(['Item 1 v2', 'Item 2', 'Item 3 v2'])

    // Back to a cacheable policy: every page is a cache slice again.
    secondPageIsUncached = false
    await query.refresh()

    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(titles(query.data)).toEqual(['Item 1 v2', 'Item 2 v2', 'Item 3 v2'])
    expect(titles(stack.readMany('items'))).toEqual(['Item 1 v2', 'Item 2 v2', 'Item 3 v2'])
  })

  it('reloads each page with its own policy on refresh', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(3) } })
    const query = await paginate(stack)
    await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await query.fetchMore({ pageIndex: 2 })
    const fetches = stack.remote.callCount('fetchMany', 'items')

    stack.remote.seed('items', rows(3).map(item => ({ ...item, title: `${item.title} v2` })))
    await query.refresh()

    expect(stack.remote.callCount('fetchMany', 'items')).toBe(fetches + 3)
    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(titles(query.data)).toEqual(['Item 1 v2', 'Item 2 v2', 'Item 3 v2'])
    expect(ids(stack.readMany('items'))).toEqual(['1', '3'])
  })
})

describe('cache reactivity of computed pages', () => {
  it('keeps recomputing every page from the cache when no page is uncached', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(4) } })
    const query = await paginate(stack, { pageSize: 2 })
    await query.fetchMore({ pageIndex: 1 })
    expect(pageIds(query)).toEqual([['1', '2'], ['3', '4']])

    await stack.store.items.delete('1')

    // Computed pages are slices of the cache, so removing a row shifts them.
    expect(pageIds(query)).toEqual([['2', '3'], ['4']])
    expect(ids(query.data)).toEqual(['2', '3', '4'])
  })

  it('keeps updating cached pages of a mixed query', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(3) } })
    const query = await paginate(stack)
    await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await query.fetchMore({ pageIndex: 2 })

    await stack.store.items.update({ id: '3', title: 'Edited' })

    expect(titles(query.pages.value[2].data)).toEqual(['Edited'])
    expect(titles(query.data)).toEqual(['Item 1', 'Item 2', 'Edited'])
  })
})

describe('garbage collection with mixed page policies', () => {
  it('does not let an uncached page own cached rows', async () => {
    const stack = await createVueStack({ schema, data: { items: rows(3) }, tombstoneGc: false })
    const query = await paginate(stack, { experimentalGarbageCollection: true })
    await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await query.fetchMore({ pageIndex: 2 })
    await drainGarbageCollection()

    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(ids(query.data)).toEqual(['1', '2', '3'])
    expect(ids(stack.readMany('items'))).toEqual(['1', '3'])

    // Row `2` is not cached, so reloading its page owns nothing to release.
    await query.fetchMore({ pageIndex: 1, fetchPolicy: 'no-cache' })
    await drainGarbageCollection()

    expect(ids(query.data)).toEqual(['1', '2', '3'])
    expect(stack.read('items', '1')).toBeDefined()
    expect(stack.read('items', '3')).toBeDefined()
  })

  it('keeps a later page addressable once its predecessor releases its rows', async () => {
    let secondPageIsUncached = false
    const stack = await createVueStack({
      schema,
      data: { items: rows(3) },
      tombstoneGc: false,
      plugins: [uncachedSecondPage(() => secondPageIsUncached)],
    })
    const query = await paginate(stack, { experimentalGarbageCollection: true })
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })
    expect(ids(stack.readMany('items'))).toEqual(['1', '2', '3'])

    secondPageIsUncached = true
    await query.refresh()
    await drainGarbageCollection()

    // The page that owned row `2` no longer holds it in the cache, so the
    // cached sequence the third page was sliced out of has a hole in it.
    expect(stack.read('items', '2')).toBeUndefined()
    expect(pageIds(query)).toEqual([['1'], ['2'], ['3']])
    expect(ids(query.data)).toEqual(['1', '2', '3'])
  })
})
