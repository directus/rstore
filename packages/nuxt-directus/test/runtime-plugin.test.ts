import { findMany } from '@rstore/core'
import { createNuxtApp } from 'nuxt/app'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { createCoreStore } from '../../../test/utils/store/realCacheStore'
import plugin from '../src/runtime/plugin'

vi.mock('@directus/sdk', async () => (await import('../../directus/test/utils/sdk-mocks')).directusSdkMocks())

describe('runtime plugin', () => {
  it('gives each Nuxt app its own usable Directus client and scoped store hooks', async () => {
    const applications = []
    for (let index = 0; index < 2; index++) {
      const nuxt = createNuxtApp({
        vueApp: createSSRApp({}),
        ssrContext: { url: '/', payload: {}, runtimeConfig: { public: {}, app: {} } } as any,
      })
      onTestFinished(() => nuxt._scope.stop())
      const stack = await nuxt.runWithContext(() => createCoreStore({
        schema: [{ name: 'Todos', scopeId: 'test-scope', meta: { directus: { collection: 'Todos' } }, getKey: (item: any) => item.id }],
        plugins: [plugin],
        syncImmediately: false,
        tombstoneGc: false,
      }))
      onTestFinished(stack.dispose)
      applications.push({ nuxt, stack })
    }
    const firstClient = applications[0]!.nuxt.$directus as any
    const secondClient = applications[1]!.nuxt.$directus as any
    expect(firstClient).not.toBe(secondClient)
    expect(firstClient.url).toBe('https://directus.example.com')
    expect(secondClient.url).toBe('https://directus.example.com')
    firstClient.request.mockResolvedValue([{ id: 1, title: 'First app' }, { id: 2, title: 'First peer' }])
    secondClient.request.mockResolvedValue([{ id: 7, title: 'Second app' }, { id: 8, title: 'Second peer' }])

    for (const [index, { stack }] of applications.entries()) {
      const { result } = await findMany({ store: stack.store, collection: stack.store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
      expect(result).toEqual(index === 0
        ? [{ id: 1, title: 'First app' }, { id: 2, title: 'First peer' }]
        : [{ id: 7, title: 'Second app' }, { id: 8, title: 'Second peer' }])
    }
    expect(firstClient.request).toHaveBeenCalledExactlyOnceWith({ op: 'readItems', args: ['Todos', {}] })
    expect(secondClient.request).toHaveBeenCalledExactlyOnceWith({ op: 'readItems', args: ['Todos', {}] })
  })
})
