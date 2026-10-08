import { findMany } from '@rstore/core'
import { createNuxtApp } from 'nuxt/app'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { createCoreStore } from '../../../test/utils/store/realCacheStore'
import { jsonResponse } from '../../monospace/test/utils/http'
import plugin from '../src/runtime/plugin'

describe('runtime plugin', () => {
  it('gives each Nuxt app its own REST client and correctly configured scoped requests', async () => {
    const applications = []
    for (let index = 0; index < 2; index++) {
      // Each client captures its own external fetch dependency at creation.
      const fetch = vi.fn(async () => jsonResponse({ data: index === 0
        ? [{ id: 1, title: 'First app' }, { id: 2, title: 'First peer' }]
        : [{ id: 7, title: 'Second app' }, { id: 8, title: 'Second peer' }] }))
      vi.stubGlobal('fetch', fetch)
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const nuxt = createNuxtApp({
        vueApp: createSSRApp({}),
        ssrContext: { url: '/', payload: {}, runtimeConfig: { public: {}, app: {} } } as any,
      })
      onTestFinished(() => nuxt._scope.stop())
      const stack = await nuxt.runWithContext(() => createCoreStore({
        schema: [{ name: 'Todos', scopeId: 'test-scope', meta: { monospace: { collection: 'Todos' } }, getKey: (item: any) => item.id }],
        plugins: [plugin],
        syncImmediately: false,
        tombstoneGc: false,
      }))
      onTestFinished(stack.dispose)
      applications.push({ nuxt, stack, fetch })
    }
    expect(applications[0]!.nuxt.$monospace).not.toBe(applications[1]!.nuxt.$monospace)
    for (const [index, { stack, fetch }] of applications.entries()) {
      const { result } = await findMany({ store: stack.store, collection: stack.store.$collections[0]!, findOptions: { fetchPolicy: 'fetch-only' } })
      expect(result).toEqual(index === 0
        ? [{ id: 1, title: 'First app' }, { id: 2, title: 'First peer' }]
        : [{ id: 7, title: 'Second app' }, { id: 8, title: 'Second peer' }])
      expect(fetch).toHaveBeenCalledExactlyOnceWith('https://example.monospace.io/api/blog/items/Todos?fields=*', {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Authorization': 'Bearer runtime-token', 'Cache-Control': 'no-cache' },
      })
    }
  })
})
