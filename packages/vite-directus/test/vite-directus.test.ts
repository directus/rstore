import type { DirectusCollectionDefinition } from '@rstore/directus/schema'
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
  writeViteVirtualModuleEntry,
} from '../../../test/utils/viteVirtualModule'

const fixtures = vi.hoisted(() => {
  const collections: DirectusCollectionDefinition[] = [{
    name: 'Todos',
    scopeId: 'test-scope',
    meta: {
      primaryKeys: ['id'],
      directus: {
        collection: 'Todos',
        singleton: false,
      },
    },
    relations: {},
    directusFields: [{
      collection: 'Todos',
      field: 'id',
      type: 'integer',
      schema: {
        is_primary_key: true,
        is_nullable: false,
      },
    }, {
      collection: 'Todos',
      field: 'title',
      type: 'string',
      schema: {
        is_primary_key: false,
        is_nullable: false,
      },
    }] as any,
    typeName: 'Todos',
    getKeyExpression: 'item.id',
  } as DirectusCollectionDefinition]
  collections[0]!['~type'] = 'collection'

  return {
    collections,
    loadDirectusCollections: vi.fn(async () => collections),
  }
})

vi.mock('@rstore/directus', async () => {
  return await import('../../directus/src')
})

vi.mock('@rstore/directus/schema', async () => {
  const actual = await import('../../directus/src/schema')
  return {
    ...actual,
    loadDirectusCollections: fixtures.loadDirectusCollections,
  }
})

const tempRoots = createViteTempRoots()

afterEach(async () => {
  fixtures.loadDirectusCollections.mockClear()
  await tempRoots.cleanup()
})

describe('rstoreDirectus', () => {
  it('throws a clear error when required options are missing', async () => {
    const { rstoreDirectus } = await import('../src')
    const plugin = rstoreDirectus({})

    await expect(runViteBuildStart(plugin)).rejects.toThrow('@rstore/vite-directus requires url and adminToken options')
  })

  it('resolves generated modules with Vite internal IDs', async () => {
    const { rstoreDirectus } = await import('../src')
    const plugin = rstoreDirectus({
      url: 'https://directus.example.com',
      adminToken: 'secret-admin-token',
      scopeId: 'test-scope',
    })

    expect(resolveViteVirtualModule(plugin, 'virtual:rstore-directus/schema')).toBe('\0virtual:rstore-directus/schema')
  })

  it('generates virtual schema, plugin, index, and declarations without leaking the admin token', async () => {
    const { rstoreDirectus } = await import('../src')
    const root = await tempRoots.create('rstore-vite-directus-')
    const plugin = rstoreDirectus({
      url: 'https://directus.example.com',
      adminToken: 'secret-admin-token',
      scopeId: 'test-scope',
    })

    resolveViteConfig(plugin, root)
    await runViteBuildStart(plugin)

    const indexCode = await loadViteVirtualModule(plugin, 'virtual:rstore-directus')
    const schemaCode = await loadViteVirtualModule(plugin, 'virtual:rstore-directus/schema')
    const pluginCode = await loadViteVirtualModule(plugin, 'virtual:rstore-directus/plugin')
    const declarations = await readFile(join(root, 'rstore-directus.d.ts'), 'utf8')

    expect(indexCode).toContain('virtual:rstore-directus/schema')
    expect(schemaCode).toContain('export const schema')
    expect(schemaCode).not.toContain('export interface')
    expect(schemaCode).not.toContain('import type')
    expect(schemaCode).not.toContain('satisfies')
    expect(pluginCode).toContain('createDirectusRstorePlugin')
    expect(pluginCode).toContain('https://directus.example.com')
    expect(indexCode).not.toContain('secret-admin-token')
    expect(schemaCode).not.toContain('secret-admin-token')
    expect(pluginCode).not.toContain('secret-admin-token')
    expect(declarations).toContain('declare module \'virtual:rstore-directus/schema\'')
    expect(declarations).toContain('from \'@rstore/vue\'')
    expect(declarations).not.toContain('@rstore/shared')
    expect(declarations).toContain('export interface Todos')
    expect(declarations).toContain('declare module \'virtual:rstore-directus/plugin\'')
    expect(declarations).toContain('createDirectusRstorePlugin')
  })

  it('builds the virtual schema module as plain JavaScript', async () => {
    const { rstoreDirectus } = await import('../src')
    const root = await tempRoots.create('rstore-vite-directus-')
    await writeViteVirtualModuleEntry(root, 'virtual:rstore-directus/schema')

    await build({
      root,
      logLevel: 'silent',
      plugins: [
        rstoreDirectus({
          url: 'https://directus.example.com',
          adminToken: 'secret-admin-token',
          scopeId: 'test-scope',
        }),
      ],
    })
  })
})
