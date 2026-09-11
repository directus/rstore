import type { MonospaceCollectionDefinition } from '@rstore/monospace/schema'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createViteTempRoots,
  loadViteVirtualModule,
  resolveViteConfig,
  resolveViteVirtualModule,
  runViteBuildStart,
  runViteHook,
  writeViteVirtualModuleEntry,
} from '../../../test/utils/viteVirtualModule'

const fixtures = vi.hoisted(() => {
  const collections: MonospaceCollectionDefinition[] = [{
    name: 'Todos',
    scopeId: 'test-scope',
    meta: {
      primaryKeys: ['id'],
      monospace: {
        collection: 'Todos',
      },
    },
    relations: {
      author: {
        to: {
          Profiles: {
            on: {
              id: 'author$id',
            },
          },
        },
      },
    },
    itemFields: [{
      name: 'id',
      optional: false,
      type: 'number',
    }, {
      name: 'title',
      optional: false,
      type: 'string',
    }],
    typeName: 'Todos',
    getKeyExpression: 'item.id',
  } as MonospaceCollectionDefinition]
  collections[0]!['~type'] = 'collection'

  return {
    collections,
    loadMonospaceCollections: vi.fn(async () => collections),
  }
})

vi.mock('@rstore/monospace', async () => {
  return await import('../../monospace/src')
})

vi.mock('@rstore/monospace/schema', async () => {
  const actual = await import('../../monospace/src/schema')
  return {
    ...actual,
    loadMonospaceCollections: fixtures.loadMonospaceCollections,
  }
})

const tempRoots = createViteTempRoots()

afterEach(async () => {
  fixtures.loadMonospaceCollections.mockClear()
  await tempRoots.cleanup()
})

describe('rstoreMonospace', () => {
  it('throws a clear error when required remote options are missing', async () => {
    const { rstoreMonospace } = await import('../src')
    const plugin = rstoreMonospace({})

    await expect(runViteBuildStart(plugin)).rejects.toThrow('@rstore/vite-monospace requires url and project options to load the remote Monospace schema, or both input and metadataInput for local generation')
  })

  it('resolves generated modules with Vite internal IDs', async () => {
    const { rstoreMonospace } = await import('../src')
    const plugin = rstoreMonospace({
      project: 'blog',
      schemaApiKey: 'secret-schema-token',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    expect(resolveViteVirtualModule(plugin, 'virtual:rstore-monospace/schema')).toBe('\0virtual:rstore-monospace/schema')
  })

  it('rejects local OpenAPI input without a metadata snapshot or remote options', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      scopeId: 'test-scope',
    })

    resolveViteConfig(plugin, root)
    // Schema generation requires the metadata queries: a lone OpenAPI file
    // is not sufficient anymore.
    await expect(runViteBuildStart(plugin)).rejects.toThrow(/remote Monospace schema metadata, or both input and metadataInput/)
  })

  it('loads local OpenAPI and metadata inputs without requiring remote schema options', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    resolveViteConfig(plugin, root)
    await runViteBuildStart(plugin)

    expect(fixtures.loadMonospaceCollections).toHaveBeenCalledWith(expect.objectContaining({
      input: join(root, 'openapi.json'),
      metadataInput: join(root, 'schema-metadata.json'),
      project: undefined,
      scopeId: 'test-scope',
      url: undefined,
    }))
  })

  it('generates virtual schema, plugin, index, and declarations without leaking schema credentials', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    const plugin = rstoreMonospace({
      project: 'blog',
      runtimeApiKey: 'public-runtime-token',
      schemaApiKey: 'secret-schema-token',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    resolveViteConfig(plugin, root)
    await runViteBuildStart(plugin)

    const indexCode = await loadViteVirtualModule(plugin, 'virtual:rstore-monospace')
    const schemaCode = await loadViteVirtualModule(plugin, 'virtual:rstore-monospace/schema')
    const pluginCode = await loadViteVirtualModule(plugin, 'virtual:rstore-monospace/plugin')
    const declarations = await readFile(join(root, 'rstore-monospace.d.ts'), 'utf8')

    expect(indexCode).toContain('virtual:rstore-monospace/schema')
    expect(schemaCode).toContain('export const schema')
    expect(pluginCode).toContain('createMonospaceRestClient')
    expect(pluginCode).toContain('public-runtime-token')
    expect(indexCode).not.toContain('secret-schema-token')
    expect(schemaCode).not.toContain('secret-schema-token')
    expect(pluginCode).not.toContain('secret-schema-token')
    expect(declarations).toContain('declare module \'virtual:rstore-monospace/schema\'')
    expect(declarations).toContain('export interface Todos')
    expect(declarations).toContain('readonly relations: {"author":{"to":{"Profiles":{"on":{"id":"author$id"}}}}}')
    expect(schemaCode).toContain('"author":{"to":{"Profiles":{"on":{"id":"author$id"}}}}')
  })

  it('watches the local schema inputs and reloads collections when they change', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    const input = join(root, 'openapi.json')
    const metadataInput = join(root, 'schema-metadata.json')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    resolveViteConfig(plugin, root)
    const addWatchFile = vi.fn()
    await runViteBuildStart(plugin, { addWatchFile })
    expect(addWatchFile).toHaveBeenCalledWith(input)
    expect(addWatchFile).toHaveBeenCalledWith(metadataInput)
    expect(fixtures.loadMonospaceCollections).toHaveBeenCalledTimes(1)

    const watchChange = plugin.watchChange
    if (typeof watchChange === 'function') {
      runViteHook(watchChange, metadataInput, { event: 'update' })
    }
    await loadViteVirtualModule(plugin, 'virtual:rstore-monospace/schema')
    expect(fixtures.loadMonospaceCollections).toHaveBeenCalledTimes(2)
  })

  it('invalidates virtual modules when the dev server sees input changes', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    const input = join(root, 'openapi.json')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    resolveViteConfig(plugin, root)
    await runViteBuildStart(plugin, { addWatchFile: vi.fn() })

    const changeListeners: Array<(file: string) => void> = []
    const invalidateModule = vi.fn()
    const send = vi.fn()
    const server = {
      moduleGraph: {
        getModuleById: vi.fn((id: string) => id.includes('schema') ? { id } : undefined),
        invalidateModule,
      },
      watcher: {
        add: vi.fn(),
        on: vi.fn((event: string, listener: (file: string) => void) => {
          if (event === 'change') {
            changeListeners.push(listener)
          }
        }),
      },
      ws: { send },
    }

    const configureServer = plugin.configureServer
    if (typeof configureServer === 'function') {
      await runViteHook(configureServer, server)
    }

    expect(server.watcher.add).toHaveBeenCalledWith(input)
    changeListeners.forEach(listener => listener(input))

    expect(invalidateModule).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' })
    await loadViteVirtualModule(plugin, 'virtual:rstore-monospace/schema')
    expect(fixtures.loadMonospaceCollections).toHaveBeenCalledTimes(2)
  })

  it('builds the virtual schema module as plain JavaScript', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await tempRoots.create('rstore-vite-monospace-')
    await writeViteVirtualModuleEntry(root, 'virtual:rstore-monospace/schema')

    await build({
      root,
      logLevel: 'silent',
      plugins: [
        rstoreMonospace({
          project: 'blog',
          schemaApiKey: 'secret-schema-token',
          scopeId: 'test-scope',
          url: 'https://example.monospace.io',
        }),
      ],
    })
  })
})
