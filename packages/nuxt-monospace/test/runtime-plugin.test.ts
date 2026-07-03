import type { PluginSetupApi } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => {
  const clients: Array<{ id: number }> = []
  const nuxtApps: Array<{ $monospace?: unknown }> = []

  return {
    clients,
    nuxtApps,
    createMonospaceRestClient: vi.fn(() => {
      const client = { id: clients.length + 1 }
      clients.push(client)
      return client
    }),
    createMonospaceRstorePlugin: vi.fn((options: Record<string, unknown>) => {
      return {
        name: 'rstore-monospace',
        category: 'remote',
        scopeId: options.scopeId,
        setup: vi.fn(),
      }
    }),
    useNuxtApp: vi.fn(() => {
      const nuxtApp = {}
      nuxtApps.push(nuxtApp)
      return nuxtApp
    }),
  }
})

vi.mock('#build/$rstore-monospace-config.js', () => ({
  apiKey: 'runtime-token',
  project: 'blog',
  scopeId: 'test-scope',
  url: 'https://example.monospace.io',
}))

vi.mock('#imports', () => ({
  useNuxtApp: fixtures.useNuxtApp,
}))

vi.mock('@rstore/monospace', () => ({
  createMonospaceRestClient: fixtures.createMonospaceRestClient,
  createMonospaceRstorePlugin: fixtures.createMonospaceRstorePlugin,
}))

beforeEach(() => {
  vi.resetModules()
  fixtures.clients.length = 0
  fixtures.nuxtApps.length = 0
  fixtures.createMonospaceRestClient.mockClear()
  fixtures.createMonospaceRstorePlugin.mockClear()
  fixtures.useNuxtApp.mockClear()
})

describe('runtime plugin', () => {
  it('creates a fresh Monospace client for each setup call', async () => {
    const plugin = (await import('../src/runtime/plugin')).default
    const setupApi = {
      addCollectionDefaults: vi.fn(),
      hook: vi.fn(),
    } as unknown as PluginSetupApi

    plugin.setup(setupApi)
    plugin.setup(setupApi)

    expect(fixtures.createMonospaceRestClient).toHaveBeenCalledTimes(2)
    expect(fixtures.createMonospaceRestClient).toHaveBeenCalledWith({
      apiKey: 'runtime-token',
      project: 'blog',
      url: 'https://example.monospace.io',
    })
    expect(fixtures.createMonospaceRstorePlugin).toHaveBeenCalledTimes(2)
    expect(fixtures.createMonospaceRstorePlugin).toHaveBeenNthCalledWith(1, {
      client: fixtures.clients[0],
      scopeId: 'test-scope',
    })
    expect(fixtures.nuxtApps[0]?.$monospace).toBe(fixtures.clients[0])
    expect(fixtures.nuxtApps[1]?.$monospace).toBe(fixtures.clients[1])
  })
})
