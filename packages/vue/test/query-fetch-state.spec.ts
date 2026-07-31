import { describe, expect, it, vi } from 'vitest'
import { trackUnhandledRejections } from '../../core/test/utils/unhandledRejections'
import { createStore } from '../src/store'

/**
 * Promise whose settlement is driven by the test, used to hold a fetch in flight
 * while asserting on the intermediate state.
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Store with a `messages` collection whose `fetchMany` returns immediately until
 * `defer()` is called, after which it returns a deferred controlled by the test.
 * Lets a test warm the cache first, then hold the background fetch in flight.
 */
async function createDeferrableStore(immediateResult: Array<{ id: string, text: string }> = []) {
  const deferred = createDeferred<Array<{ id: string, text: string }>>()
  let deferring = false
  const store = await createStore({
    schema: [
      {
        name: 'messages',
        hooks: {
          fetchMany: () => deferring ? deferred.promise : immediateResult,
        },
      },
    ],
    plugins: [],
  })
  return {
    store,
    deferred,
    defer: () => {
      deferring = true
    },
  }
}

describe('query fetch state', () => {
  describe('cache-and-fetch with an empty cache', () => {
    it('should report loading while the background fetch runs', async () => {
      const { store, deferred, defer } = await createDeferrableStore()
      defer()

      const query = await store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      }))

      // The blocking half is a cache read - it already settled with nothing to show.
      expect(query.foreground.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(true)
      expect(query.background.loading.value).toBe(true)
      expect(query.background.completed.value).toBe(false)
      expect(query.data.value).toHaveLength(0)
      // There is nothing to look at, so the friendly aggregate reports loading.
      expect(query.loading.value).toBe(true)

      deferred.resolve([{ id: '1', text: 'hello' }])
      await query.background.promise

      expect(query.background.loading.value).toBe(false)
      expect(query.background.completed.value).toBe(true)
      expect(typeof query.background.lastUpdated.value).toBe('number')
      expect(query.loading.value).toBe(false)
      expect(query.data.value).toHaveLength(1)
    })
  })

  describe('cache-and-fetch with a warm cache', () => {
    it('should not report loading while the background fetch runs', async () => {
      const { store, deferred, defer } = await createDeferrableStore([{ id: '1', text: 'hello' }])

      // Warm the cache.
      await store.messages.query(q => q.many({
        fetchPolicy: 'fetch-only',
      }))
      defer()

      const query = await store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      }))

      expect(query.data.value).toHaveLength(1)
      expect(query.background.loading.value).toBe(true)
      // Cached data is on screen, so the silent refresh stays invisible.
      expect(query.loading.value).toBe(false)

      deferred.resolve([{ id: '1', text: 'hello' }, { id: '2', text: 'world' }])
      await query.background.promise

      expect(query.loading.value).toBe(false)
      expect(query.data.value).toHaveLength(2)
    })

    it('should route a background failure to the background state only', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const rejections = trackUnhandledRejections()
      try {
        const { store, deferred, defer } = await createDeferrableStore([{ id: '1', text: 'hello' }])

        await store.messages.query(q => q.many({
          fetchPolicy: 'fetch-only',
        }))
        defer()

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        }))

        deferred.reject(new Error('Fetch failed'))
        await query.background.promise

        expect(query.background.error.value?.message).toBe('Fetch failed')
        expect(query.foreground.error.value).toBe(null)
        expect(query.error.value?.message).toBe('Fetch failed')
        expect(query.mainPage.background.error?.message).toBe('Fetch failed')
        expect(query.mainPage.foreground.error).toBe(null)
        // The cached data is still valid to display.
        expect(query.data.value).toHaveLength(1)
        expect(query.loading.value).toBe(false)
        expect(await rejections.flush()).toEqual([])
      }
      finally {
        rejections.stop()
        consoleError.mockRestore()
      }
    })
  })

  describe('lane promises', () => {
    it('should resolve without rejecting when a fetch fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const rejections = trackUnhandledRejections()
      try {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  throw new Error('Fetch failed')
                },
              },
            },
          ],
          plugins: [],
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        }))

        await expect(query.foreground.promise).resolves.toBeUndefined()
        await expect(query.background.promise).resolves.toBeUndefined()
        expect(query.background.error.value?.message).toBe('Fetch failed')
        expect(await rejections.flush()).toEqual([])
      }
      finally {
        rejections.stop()
        consoleError.mockRestore()
      }
    })

    it('should be already resolved when no fetch of that kind ever ran', async () => {
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: () => [{ id: '1', text: 'hello' }],
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many())

      // `cache-first` has no background half - awaiting it must not hang.
      await expect(query.background.promise).resolves.toBeUndefined()
      expect(query.background.completed.value).toBe(false)
      expect(query.background.lastUpdated.value).toBe(null)
    })
  })

  describe('foreground failures', () => {
    it('should route a fetch failure to the foreground state only', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  throw new Error('Fetch failed')
                },
              },
            },
          ],
          plugins: [],
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'no-cache',
        }))

        expect(query.foreground.error.value?.message).toBe('Fetch failed')
        expect(query.background.error.value).toBe(null)
        expect(query.error.value?.message).toBe('Fetch failed')
        // A failed fetch still counts as settled, but never updates the timestamp.
        expect(query.foreground.completed.value).toBe(true)
        expect(query.foreground.lastUpdated.value).toBe(null)
      }
      finally {
        consoleError.mockRestore()
      }
    })

    it('should clear both lane errors when a refresh succeeds', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        let shouldFail = true
        const store = await createStore({
          schema: [
            {
              name: 'messages',
              hooks: {
                fetchMany: () => {
                  if (shouldFail) {
                    throw new Error('Fetch failed')
                  }
                  return [{ id: '1', text: 'hello' }]
                },
              },
            },
          ],
          plugins: [],
        })

        const query = await store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        }))

        await query.background.promise
        expect(query.background.error.value?.message).toBe('Fetch failed')

        shouldFail = false
        await query.refresh()

        expect(query.background.error.value).toBe(null)
        expect(query.foreground.error.value).toBe(null)
        expect(query.error.value).toBe(null)
        expect(query.data.value?.[0]?.text).toBe('hello')
      }
      finally {
        consoleError.mockRestore()
      }
    })
  })

  describe('page fetch state', () => {
    it('should move the foreground lane only when fetching more pages', async () => {
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: ({ pageIndex }) => [
                { id: `message${pageIndex! * 2 + 1}`, text: `Message ${pageIndex! * 2 + 1}` },
                { id: `message${pageIndex! * 2 + 2}`, text: `Message ${pageIndex! * 2 + 2}` },
              ],
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        pageIndex: 0,
        pageSize: 2,
      }))

      expect(query.mainPage.foreground.completed).toBe(true)
      expect(query.mainPage.background.loading).toBe(false)

      const fetchMorePromise = query.fetchMore({ pageIndex: 1 })
      const { page } = fetchMorePromise

      expect(page.foreground.loading).toBe(true)
      expect(page.background.loading).toBe(false)
      expect(page.loading).toBe(true)
      // `fetchMore` is a foreground fetch, so the query reports loading.
      expect(query.foreground.loading.value).toBe(true)
      expect(query.loading.value).toBe(true)

      await fetchMorePromise

      expect(page.foreground.loading).toBe(false)
      expect(page.foreground.completed).toBe(true)
      expect(typeof page.foreground.lastUpdated).toBe('number')
      expect(page.completed).toBe(true)
      expect(page.loading).toBe(false)
    })

    it('should track the background lane per page', async () => {
      const { store, deferred, defer } = await createDeferrableStore()
      defer()

      const query = await store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      }))

      expect(query.mainPage.background.loading).toBe(true)
      expect(query.mainPage.foreground.loading).toBe(false)
      expect(query.mainPage.loading).toBe(true)

      deferred.resolve([{ id: '1', text: 'hello' }])
      await query.background.promise

      expect(query.mainPage.background.loading).toBe(false)
      expect(query.mainPage.background.completed).toBe(true)
      expect(query.mainPage.loading).toBe(false)
    })
  })

  describe('disabled queries', () => {
    it('should leave both lanes idle', async () => {
      const store = await createStore({
        schema: [
          {
            name: 'messages',
            hooks: {
              fetchMany: () => [{ id: '1', text: 'hello' }],
            },
          },
        ],
        plugins: [],
      })

      const query = await store.messages.query(q => q.many({
        enabled: false,
      } as any))

      expect(query.loading.value).toBe(false)
      expect(query.foreground.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(false)
      expect(query.foreground.lastUpdated.value).toBe(null)
      expect(query.mainPage.completed).toBe(false)
      await expect(query.foreground.promise).resolves.toBeUndefined()
    })
  })
})
