import type { CachePage, ReadReply, SessionSummary } from '@rstore/devtools/protocol'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { $fetch, createPage, setup, url, waitForHydration } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { openRelayRpc } from '../../../devtools/src/node/rpc'

/** Real Nuxt dev server, generated plugin, SSR render, and custom inspector mount. */
describe('portable devtools Nuxt boot', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/devtools', import.meta.url)),
    dev: true,
    build: true,
    browser: true,
    browserOptions: { type: 'chromium', launch: { headless: true } },
  })

  it('renders store application while serving custom inspector and private-safe bootstrap', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('store-ready')
    expect(html).not.toContain('__RSTORE_DEVTOOLS__')
    expect(html).not.toContain('authToken')
    const inspector = await $fetch<string>('/inspect/')
    expect(inspector).toContain('<html')
    const bootstrap = await $fetch<{ protocolVersion: number, baseURL: string, authToken: string }>('/inspect/bootstrap.json')
    expect(bootstrap.protocolVersion).toBe(1)
    expect(new URL(bootstrap.baseURL).pathname).toBe('/inspect/')
    const connection = await $fetch<object>('/inspect/__connection.json')
    expect(JSON.stringify(connection)).not.toContain(bootstrap.authToken)
  })

  it('hydrates captured cache and automatically publishes browser producer with fresh reload identity', async () => {
    const bootstrap = await $fetch<{ baseURL: string, authToken: string }>('/inspect/bootstrap.json')
    const viewer = await openRelayRpc(bootstrap)
    let releasePage: (() => Promise<void>) | undefined
    try {
      const page = await createPage('/ssr/browser')
      releasePage = () => page.close()
      await expect.poll(async () => {
        const sessions = await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]
        return sessions.filter(session => session.kind === 'browser' && session.connected && session.stores.some(store => store.target.storeId === 'default')).length
      }, { timeout: 15_000 }).toBe(1)
      const sessions = await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]
      const browser = sessions.find(session => session.kind === 'browser' && session.connected)!
      const target = browser.stores[0]!.target
      expect(target.storeId).toBe('default')
      const cache = await viewer.rpc.$call('rstore:get-cache', { target, collection: 'todos' }) as ReadReply<CachePage>
      expect(cache.target).toEqual(target)
      expect(cache.data.rows).toEqual([{ key: 0, value: { kind: 'object', entries: [['id', 0], ['title', '/ssr/browser']] } }])
      expect(await page.locator('body').textContent()).toContain('store-ready')
      await expect(viewer.rpc.$call('rstore:write-cache-item', { action: 'write-cache-item', target, commandId: randomUUID(), issuedAt: Date.now(), collection: 'todos', item: { id: 0, title: 'forbidden' } })).rejects.toThrow()
      const untouched = await viewer.rpc.$call('rstore:get-cache', { target, collection: 'todos' }) as ReadReply<CachePage>
      expect(untouched.data.rows).toEqual(cache.data.rows)
      await page.reload()
      await waitForHydration(page, page.url(), 'hydration')
      await expect.poll(async () => {
        const current = await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]
        return current.some(session => session.kind === 'browser' && session.connected && session.sessionId !== browser.sessionId && session.stores.some(store => store.target.storeId === 'default'))
      }, { timeout: 15_000 }).toBe(true)
      const replacement = (await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]).find(session => session.kind === 'browser' && session.connected && session.sessionId !== browser.sessionId)!
      expect(replacement.stores[0]!.target.storeId).toBe('default')
      await expect.poll(async () => (await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]).find(session => session.sessionId === browser.sessionId)?.connected, { timeout: 10_000 }).toBe(false)
      await expect(viewer.rpc.$call('rstore:get-cache', { target, collection: 'todos' })).rejects.toThrow()
      const refreshed = await viewer.rpc.$call('rstore:get-cache', { target: replacement.stores[0]!.target, collection: 'todos' }) as ReadReply<CachePage>
      expect(refreshed.data.rows[0]!.key).toBe(0)
      expect(JSON.stringify(refreshed.data.rows[0]!.value)).toContain('/ssr/browser')
      const inspector = await createPage()
      try {
        await inspector.goto(new URL('/inspect/', page.url()).href)
        expect(await inspector.title()).toMatch(/rstore/i)
        await inspector.getByLabel('Relay URL').fill(bootstrap.baseURL)
        await inspector.getByLabel('Auth token').fill(bootstrap.authToken)
        await inspector.getByRole('button', { name: 'Connect', exact: true }).click()
        await inspector.getByLabel('Session and store').selectOption({ label: `${replacement.label} / default` })
        await expect.poll(() => inspector.locator('body').textContent(), { timeout: 10_000 }).toContain('1 cached')
        await inspector.getByRole('button', { name: 'Cache', exact: true }).click()
        await expect.poll(() => inspector.locator('body').textContent(), { timeout: 10_000 }).toContain('/ssr/browser')
      }
      finally {
        await inspector.close()
      }
      const surviving = await viewer.rpc.$call('rstore:get-cache', { target: replacement.stores[0]!.target, collection: 'todos' }) as ReadReply<CachePage>
      expect(surviving.data.rows).toEqual(refreshed.data.rows)
    }
    finally {
      try {
        await releasePage?.()
      }
      finally {
        viewer.close()
      }
    }
  })

  it('routes live and completed SSR inspections through authenticated sidecar without granting writes', async () => {
    const bootstrap = await $fetch<{ baseURL: string, authToken: string }>('/inspect/bootstrap.json')
    const viewer = await openRelayRpc(bootstrap)
    const pending = fetch(url('/ssr/active?delay=3000'))
    try {
      await expect.poll(async () => {
        const sessions = await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]
        return sessions.some(session => session.kind === 'ssr' && !session.completed && session.label.includes('/ssr/active') && session.stores.length > 0)
      }, { timeout: 10_000 }).toBe(true)
      const active = (await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]).find(session => session.kind === 'ssr' && !session.completed && session.label.includes('/ssr/active'))!
      const target = active.stores[0]!.target
      expect(active.stores[0]!.capabilities.readOnly).toBe(true)
      const cache = await viewer.rpc.$call('rstore:get-cache', { target, collection: 'todos' }) as ReadReply<CachePage>
      expect(cache.data.rows).toEqual([{ key: 0, value: { kind: 'object', entries: [['id', 0], ['title', '/ssr/active']] } }])
      await expect(viewer.rpc.$call('rstore:clear-cache', { action: 'clear-cache', target, commandId: randomUUID(), issuedAt: Date.now() })).rejects.toThrow()
      expect((await pending).status).toBe(200)
      await expect.poll(async () => (await viewer.rpc.$call('rstore:list-sessions', {}) as SessionSummary[]).find(session => session.sessionId === active.sessionId)?.completed, { timeout: 10_000 }).toBe(true)
      const recorded = await viewer.rpc.$call('rstore:get-cache', { target, collection: 'todos' }) as ReadReply<CachePage>
      expect(recorded.data.rows).toEqual(cache.data.rows)
      await expect(viewer.rpc.$call('rstore:clear-cache', { action: 'clear-cache', target, commandId: randomUUID(), issuedAt: Date.now() })).rejects.toThrow()
    }
    finally {
      try {
        await pending
      }
      finally {
        viewer.close()
      }
    }
  })
})
