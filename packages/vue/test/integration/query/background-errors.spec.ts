import { createDeferred } from '#test-utils/deferred'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { until } from '@vueuse/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { setup } from '../../utils/query'

describe('query', () => {
  afterEach(() => {
    // The stacks stop their own effect scopes; the globals are ours to restore.
    vi.unstubAllGlobals()
  })

  describe('cache-and-fetch', () => {
    it('should update the query meta', async () => {
      const { store, run } = await setup([
        {
          name: 'messages',
        },
      ])

      store.$hooks.hook('fetchMany', ({ meta, setResult }: any) => {
        const anyMeta = meta as any
        anyMeta.meow = 'waf'
        setResult([{ id: '1', text: 'hello' }])
      })

      const query = await run(() => store.messages.query((q: any) => q.many({
        fetchPolicy: 'cache-and-fetch',
        meta: { meow: 'meow' } as any,
      })))

      await until((): number => query.data.value.length).toBe(1)

      await Promise.resolve()

      expect((query.meta.value as any).meow).toBe('waf')
    })

    it('should surface background fetch errors', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const rejections = trackUnhandledRejections()
      try {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchMany: () => {
                throw new Error('Fetch failed')
              },
            },
          },
        ])

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'cache-and-fetch',
        })))

        await until((): unknown => query.error.value).toBeTruthy()

        expect(query.error.value?.message).toBe('Fetch failed')
        expect(query.mainPage.error?.message).toBe('Fetch failed')
        expect(query.loading.value).toBe(false)
        query.error.value = null
        expect(query.error.value).toBeNull()
        expect(query.background.error.value).toBeNull()
        await query.refresh()
        expect(query.error.value?.message).toBe('Fetch failed')
        expect(await rejections.flush()).toEqual([])
      }
      finally {
        rejections.stop()
        consoleError.mockRestore()
      }
    })

    it('should ignore background fetch errors from stale requests', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const rejections = trackUnhandledRejections()
      try {
        const requests: Array<ReturnType<typeof createDeferred<any[]>>> = []
        const requestKey = ref('old')
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchMany: () => {
                const request = createDeferred<any[]>()
                requests.push(request)
                return request.promise
              },
            },
          },
        ])

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'cache-and-fetch',
          params: { requestKey: requestKey.value },
        })))

        requestKey.value = 'new'
        await nextTick()
        await vi.waitFor(() => expect(requests).toHaveLength(2))
        requests[1]!.resolve([{ id: '1', text: 'latest' }])
        await vi.waitFor(() => expect(query.data.value[0]?.text).toBe('latest'))
        requests[0]!.reject(new Error('Fetch failed'))

        expect(await rejections.flush()).toEqual([])
        expect(query.data.value).toEqual([expect.objectContaining({ text: 'latest' })])
        expect(query.error.value).toBe(null)
        expect(query.mainPage.error).toBe(null)
      }
      finally {
        rejections.stop()
        consoleError.mockRestore()
      }
    })

    it('should clear the background fetch error after a successful refresh', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        let shouldFail = true
        const { store, run } = await setup([
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
        ])

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'cache-and-fetch',
        })))

        await until((): unknown => query.error.value).toBeTruthy()

        shouldFail = false
        await query.refresh()

        expect(query.error.value).toBe(null)
        expect(query.mainPage.error).toBe(null)
        expect(query.data.value?.[0]?.text).toBe('hello')
      }
      finally {
        consoleError.mockRestore()
      }
    })
  })
})
