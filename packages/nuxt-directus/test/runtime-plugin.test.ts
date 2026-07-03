import type { PluginSetupApi } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixtures = vi.hoisted(() => {
  const clients: Array<{ id: number }> = []
  const nuxtApps: Array<{ $directus?: unknown }> = []

  return {
    clients,
    nuxtApps,
    createDirectusClient: vi.fn(() => {
      const client = { id: clients.length + 1 }
      clients.push(client)
      return client
    }),
    createDirectusRstorePlugin: vi.fn((options: Record<string, unknown>) => {
      return {
        name: 'rstore-directus',
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

vi.mock('#build/$rstore-directus-config.js', () => ({
  scopeId: 'test-scope',
  url: 'https://directus.example.com',
}))

vi.mock('#imports', () => ({
  useNuxtApp: fixtures.useNuxtApp,
}))

vi.mock('@rstore/directus', () => ({
  createDirectusClient: fixtures.createDirectusClient,
  createDirectusRstorePlugin: fixtures.createDirectusRstorePlugin,
}))

beforeEach(() => {
  vi.resetModules()
  fixtures.clients.length = 0
  fixtures.nuxtApps.length = 0
  fixtures.createDirectusClient.mockClear()
  fixtures.createDirectusRstorePlugin.mockClear()
  fixtures.useNuxtApp.mockClear()
})

describe('runtime plugin', () => {
  it('creates a fresh Directus client for each setup call', async () => {
    const plugin = (await import('../src/runtime/plugin')).default
    const setupApi = {
      addCollectionDefaults: vi.fn(),
      hook: vi.fn(),
    } as unknown as PluginSetupApi

    plugin.setup(setupApi)
    plugin.setup(setupApi)

    expect(fixtures.createDirectusClient).toHaveBeenCalledTimes(2)
    expect(fixtures.createDirectusRstorePlugin).toHaveBeenCalledTimes(2)
    expect(fixtures.createDirectusRstorePlugin).toHaveBeenNthCalledWith(1, {
      client: fixtures.clients[0],
      scopeId: 'test-scope',
    })
    expect(fixtures.createDirectusRstorePlugin).toHaveBeenNthCalledWith(2, {
      client: fixtures.clients[1],
      scopeId: 'test-scope',
    })
    expect(fixtures.nuxtApps[0]?.$directus).toBe(fixtures.clients[0])
    expect(fixtures.nuxtApps[1]?.$directus).toBe(fixtures.clients[1])
    expect(fixtures.clients[0]).not.toBe(fixtures.clients[1])
  })
})
