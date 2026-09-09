import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// `query-pagination.spec.ts` covers the page API against a fixed hook. This
// covers page coherence against a backend that keeps changing under the
// query: rows deleted between two page fetches, a mutation landing in one
// page, and a refresh that has to reload every page it holds.

const schema: StoreSchema = [{ name: 'posts' }]

/** `count` posts, `p1` … `pN`, in server order. */
function rows(count = 6) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    title: `Post ${index + 1}`,
  }))
}

/**
 * Store with a `posts` collection backed by the fake remote.
 *
 * @param data Initial backend rows.
 */
function setup(data = rows()) {
  return createVueStack({ schema, data: { posts: data } })
}

/**
 * Opens a paginated query on `posts`.
 *
 * `responseRefs` is deliberate: in the default `computed` mode a page is a
 * slice of the whole cache, so no assertion can distinguish what the server
 * returned *for that page* from what some other page happened to write. These
 * tests are about exactly that distinction.
 *
 * @param run Runs the query inside the store's effect scope.
 * @param store The store to query.
 * @param options Extra find options merged into the query.
 */
function paginate(run: any, store: any, options: Record<string, any> = {}) {
  return run(() => store.posts.query((q: any) => q.many({
    pageSize: 2,
    resultMode: 'responseRefs',
    ...options,
  })))
}

/** Ids held by a page or a query result. */
function ids(source: any): string[] {
  const value = Array.isArray(source) ? source : source?.value ?? []
  return value.map((post: any) => post.id)
}

/**
 * Page indexes of the `fetchMany` requests recorded after `from`.
 *
 * The main page leaves `pageIndex` unset when it sits at index 0, so it is
 * normalized here rather than in every assertion.
 */
function fetchedPages(remote: any, from = 0): number[] {
  return remote.requests('fetchMany', 'posts').slice(from).map((call: any) => call.findOptions.pageIndex ?? 0)
}

describe('sparse pages', () => {
  it('appends cursor pages without explicit indexes and preserves their cursors on refresh', async () => {
    const { store, run, remote } = await createVueStack({
      schema,
      data: { posts: rows() },
      on: {
        fetchMany: (ctx) => {
          const offset = ctx.payload.findOptions.params?.after ?? 0
          return ctx.rows().slice(offset, offset + 2)
        },
      },
    })
    const query = await paginate(run, store, { params: { after: 0 } })
    const second = await query.fetchMore({ params: { after: 2 } })
    const third = await query.fetchMore({ params: { after: 4 } })
    expect(ids(second.page.data)).toEqual(['p3', 'p4'])
    expect(ids(third.page.data)).toEqual(['p5', 'p6'])
    expect(ids(query.data)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])

    remote.seed('posts', rows().map(post => ({ ...post, title: `${post.title} refreshed` })))
    const before = remote.callCount('fetchMany')
    await query.refresh()
    expect(remote.requests('fetchMany').slice(before).map(call => call.findOptions.params.after).sort()).toEqual([0, 2, 4])
    expect(second.page.data[0].title).toBe('Post 3 refreshed')
    expect(third.page.data[0].title).toBe('Post 5 refreshed')
  })

  it('loads only the requested page and merges the loaded ones', async () => {
    const { store, run, remote } = await setup()
    const query = await paginate(run, store)

    const { page } = await query.fetchMore({ pageIndex: 2 })

    expect(ids(page.data)).toEqual(['p5', 'p6'])
    expect(query.pages.value[1]).toBeUndefined()
    // Page 1 is never requested: the hole stays a hole.
    expect(fetchedPages(remote)).toEqual([0, 2])
    expect(ids(query.data)).toEqual(['p1', 'p2', 'p5', 'p6'])
  })
})

describe('refresh with several pages loaded', () => {
  it('reloads every loaded page and keeps showing the current one meanwhile', async () => {
    const { store, run, remote } = await setup()
    const query = await paginate(run, store)
    await query.fetchMore({ pageIndex: 1 })
    expect(ids(query.data)).toEqual(['p1', 'p2', 'p3', 'p4'])

    remote.seed('posts', rows().map(post => ({ ...post, title: `${post.title} v2` })))
    const before = remote.callCount('fetchMany', 'posts')
    const release = remote.holdNext('fetchMany', { count: 2 })
    const refreshing = query.refresh()
    await vi.waitFor(() => expect(remote.callCount('fetchMany', 'posts')).toBe(before + 2))

    // Regression for `0c1db3a`: the main page used to be blanked while its
    // refresh was in flight.
    expect(ids(query.mainPage.data)).toEqual(['p1', 'p2'])

    release()
    await refreshing

    // Regression for `8a348c6`: only the main page used to be reloaded.
    expect(fetchedPages(remote, before).sort()).toEqual([0, 1])
    expect(ids(query.pages.value[1]!.data)).toEqual(['p3', 'p4'])
    expect(query.data.value.map((post: any) => post.title)).toEqual([
      'Post 1 v2',
      'Post 2 v2',
      'Post 3 v2',
      'Post 4 v2',
    ])
  })
})

describe('a mutation while three pages are loaded', () => {
  it('updates the item in the page that holds it, once', async () => {
    const { store, run } = await setup()
    const query = await paginate(run, store)
    await query.fetchMore({ pageIndex: 1 })
    await query.fetchMore({ pageIndex: 2 })

    await store.posts.update({ id: 'p5', title: 'Edited' })
    await nextTick()

    const titles = query.data.value.map((post: any) => post.title)
    expect(titles.filter((title: string) => title === 'Edited')).toHaveLength(1)
    expect(query.pages.value[2]!.data.map((post: any) => post.title)).toEqual(['Edited', 'Post 6'])
    expect(ids(query.pages.value[0]!.data)).toEqual(['p1', 'p2'])
    expect(ids(query.pages.value[1]!.data)).toEqual(['p3', 'p4'])
  })
})

describe('a row deleted server-side between two page fetches', () => {
  it('does not show the same item on two pages after the shift', async () => {
    const { store, run, remote } = await setup()
    const query = await paginate(run, store)
    await query.fetchMore({ pageIndex: 1 })

    // Everything shifts one slot to the left on the server.
    remote.seed('posts', rows().slice(1))
    await query.refresh()

    // Reloading only page 0 would leave page 1 holding `p3` as well.
    expect(ids(query.data)).toEqual(['p2', 'p3', 'p4', 'p5'])
    expect(ids(query.pages.value[0]!.data)).toEqual(['p2', 'p3'])
    expect(ids(query.pages.value[1]!.data)).toEqual(['p4', 'p5'])
  })
})

describe('per-page fetch options and failures', () => {
  it('honours a fetchPolicy passed to fetchMore instead of the query one', async () => {
    const { store, run, remote } = await setup()
    const query = await paginate(run, store, { fetchPolicy: 'cache-and-fetch' })
    await vi.waitFor(() => expect(ids(query.mainPage.data)).toEqual(['p1', 'p2']))

    // Slow enough that a background fetch could not have landed by the time
    // `fetchMore` resolves.
    remote.latency('fetchMany', 30)
    const { page } = await query.fetchMore({ pageIndex: 1, fetchPolicy: 'fetch-only' })

    // Regression for `d8f593e`: the query-level policy used to win, so this
    // page took the `cache-and-fetch` branch and resolved with nothing.
    expect(ids(page.data)).toEqual(['p3', 'p4'])
  })

  it('scopes a failed page fetch to that page and leaves the others loaded', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { store, run, remote } = await setup()
      const query = await paginate(run, store)

      remote.failNext('fetchMany')
      const { page } = await query.fetchMore({ pageIndex: 1 })

      expect(page.error).toBeInstanceOf(Error)
      expect(ids(page.data)).toEqual([])
      expect(query.mainPage.error).toBeNull()
      expect(ids(query.mainPage.data)).toEqual(['p1', 'p2'])
      expect(ids(query.data)).toEqual(['p1', 'p2'])
    }
    finally {
      errors.mockRestore()
    }
  })
})
