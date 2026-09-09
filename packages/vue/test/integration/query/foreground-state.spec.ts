import { createTestStore as createStore } from '#test-utils/store/integrationStore'
import { runInTestScope } from '#test-utils/store/vueApp'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { describe, expect, it, vi } from 'vitest'

describe('query fetch state', () => {
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

        const query = await runInTestScope(() => store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        })))

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

      const query = await runInTestScope(() => store.messages.query(q => q.many()))

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

        const query = await runInTestScope(() => store.messages.query(q => q.many({
          fetchPolicy: 'no-cache',
        })))

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

        const query = await runInTestScope(() => store.messages.query(q => q.many({
          fetchPolicy: 'cache-and-fetch',
        })))

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
})
