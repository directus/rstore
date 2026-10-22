import type { SSRSnapshot } from '@rstore/devtools/node'
import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

interface Diagnostics {
  activeCount: number
  snapshots: SSRSnapshot[]
}

/** Real dev Nuxt renderer + Nitro hooks, never manually invoked cleanup helpers. */
describe('automatic read-only SSR devtools lifecycle', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/devtools', import.meta.url)),
    dev: true,
    build: true,
    browser: false,
  })

  it('isolates concurrent requests and retains detached captures after response release', async () => {
    const [alpha, beta] = await Promise.all([
      $fetch<string>('/ssr/alpha?delay=100&token=must-not-retain'),
      $fetch<string>('/ssr/beta?delay=40'),
    ])
    expect(alpha).toContain('store-ready')
    expect(beta).toContain('store-ready')
    const diagnostics = await $fetch<Diagnostics>('/api/ssr-diagnostics')
    expect(diagnostics).toMatchObject({ privateConfigured: true, workerStarted: true, credentialRetained: false })
    const records = diagnostics.snapshots.filter(record => ['/ssr/alpha', '/ssr/beta'].includes(record.request.path))
    expect(records).toHaveLength(2)
    expect(new Set(records.map(record => record.session.sessionId)).size).toBe(2)
    expect(diagnostics.activeCount).toBe(0)
    for (const record of records) {
      expect(record.session.completed).toBe(true)
      expect(record.session.stores[0]!.capabilities.readOnly).toBe(true)
      expect(JSON.stringify(record.views.cache?.todos)).toContain(record.request.path)
      expect(JSON.stringify(record)).not.toContain('must-not-retain')
      expect(record.request.status).toBe('completed')
      expect(record.session.request).toEqual(record.request)
    }
    const alphaRecord = records.find(record => record.request.path === '/ssr/alpha')!
    expect(JSON.stringify(alphaRecord.views.cache)).not.toContain('/ssr/beta')
    expect(alpha).not.toContain('rstoreDevtoolsSSR')
    expect(alpha).not.toContain('authToken')
  })

  it('finalizes failed rendering and aborted response once without active handles', async () => {
    // ofetch retries GET 500 responses by default; this scenario owns one request.
    await expect($fetch('/ssr/error', { retry: 0 })).rejects.toThrow()
    const controller = new AbortController()
    const pending = fetch(url('/ssr/abort?delay=3000'), { signal: controller.signal })
    // Observe actual admitted runtime before abort; no arbitrary timing assumption.
    await expect.poll(async () => (await $fetch<Diagnostics>('/api/ssr-diagnostics')).activeCount, { timeout: 10_000 }).toBeGreaterThan(0)
    controller.abort()
    await expect(pending).rejects.toThrow()
    await expect.poll(async () => (await $fetch<Diagnostics>('/api/ssr-diagnostics')).activeCount, { timeout: 10_000 }).toBe(0)
    const diagnostics = await $fetch<Diagnostics>('/api/ssr-diagnostics')
    const errors = diagnostics.snapshots.filter(record => record.request.path === '/ssr/error')
    const aborted = diagnostics.snapshots.filter(record => record.request.path === '/ssr/abort')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.request.status).toBe('error')
    expect(errors[0]!.session.request).toEqual(errors[0]!.request)
    expect(JSON.stringify(errors[0]!.session.request)).toContain('SSR fixture failure')
    expect(JSON.stringify(errors[0]!.session.request)).toContain('500')
    expect(JSON.stringify(errors[0]!.session.request)).not.toContain('SECRET')
    expect(aborted).toHaveLength(1)
    expect(aborted[0]!.request.status).toBe('aborted')
    expect(aborted[0]!.session.request).toEqual(aborted[0]!.request)
    expect(diagnostics).toMatchObject({ credentialRetained: false })
  })
})
