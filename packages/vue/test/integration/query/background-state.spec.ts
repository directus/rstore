import { runInTestScope } from '#test-utils/store/vueApp'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { describe, expect, it, vi } from 'vitest'
import { createDeferrableStore } from '../../utils/query-fetch-state'

describe('query fetch state', () => {
  describe('cache-and-fetch with an empty cache', () => {
    it('should report loading while the background fetch runs', async () => {
      const { store, deferred, defer } = await createDeferrableStore()
      defer()

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      })))

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
      await runInTestScope(() => store.messages.query(q => q.many({
        fetchPolicy: 'fetch-only',
      })))
      defer()

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      })))

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

        await runInTestScope(() => store.messages.query(q => q.many({
          fetchPolicy: 'fetch-only',
        })))
        defer()

        const query = await runInTestScope(() => store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        })))

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
})
