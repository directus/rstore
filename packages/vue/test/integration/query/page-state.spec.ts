import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { runInTestScope } from '#test-utils/store/vueApp'
import { describe, expect, it } from 'vitest'
import { createDeferrableStore } from '../../utils/query-fetch-state'

describe('query fetch state', () => {
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

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        pageIndex: 0,
        pageSize: 2,
      })))

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

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        fetchPolicy: 'cache-and-fetch',
      })))

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

      const query = await runInTestScope(() => store.messages.query(q => q.many({
        enabled: false,
      } as any)))

      expect(query.loading.value).toBe(false)
      expect(query.foreground.loading.value).toBe(false)
      expect(query.foreground.completed.value).toBe(false)
      expect(query.foreground.lastUpdated.value).toBe(null)
      expect(query.mainPage.completed).toBe(false)
      await expect(query.foreground.promise).resolves.toBeUndefined()
    })
  })
})
