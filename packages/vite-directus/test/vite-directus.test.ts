import type { DirectusCollectionDefinition } from '@rstore/directus/schema'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

const tempDirs: string[] = []

afterEach(async () => {
  fixtures.loadDirectusCollections.mockClear()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, {
    force: true,
    recursive: true,
  })))
})

describe('rstoreDirectus', () => {
  it('throws a clear error when required options are missing', async () => {
    const { rstoreDirectus } = await import('../src')
    const plugin = rstoreDirectus({})

    await expect(runBuildStart(plugin)).rejects.toThrow('@rstore/vite-directus requires url and adminToken options')
  })

  it('generates virtual schema, plugin, index, and declarations without leaking the admin token', async () => {
    const { rstoreDirectus } = await import('../src')
    const root = await createTempRoot()
    const plugin = rstoreDirectus({
      url: 'https://directus.example.com',
      adminToken: 'secret-admin-token',
      scopeId: 'test-scope',
    })

    runConfigResolved(plugin, root)
    await runBuildStart(plugin)

    const indexCode = await runLoad(plugin, 'virtual:rstore-directus')
    const schemaCode = await runLoad(plugin, 'virtual:rstore-directus/schema')
    const pluginCode = await runLoad(plugin, 'virtual:rstore-directus/plugin')
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
    const root = await createTempRoot()
    await writeViteEntry(root)

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

/**
 * Creates and tracks a temporary Vite root directory.
 */
async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rstore-vite-directus-'))
  tempDirs.push(dir)
  return dir
}

/**
 * Writes a minimal Vite app that imports the generated schema virtual module.
 */
async function writeViteEntry(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
  await writeFile(join(root, 'src/main.ts'), `import schema from 'virtual:rstore-directus/schema'

console.log(schema.length)
`)
}

/**
 * Runs the Vite configResolved hook with the minimum config shape used by tests.
 */
function runConfigResolved(plugin: Plugin, root: string): void {
  const hook = plugin.configResolved
  if (typeof hook === 'function') {
    ;(hook as any)({ root } as ResolvedConfig)
  }
}

/**
 * Runs the Vite buildStart hook.
 */
async function runBuildStart(plugin: Plugin): Promise<void> {
  const hook = plugin.buildStart
  if (typeof hook === 'function') {
    await (hook as any).call({} as any, {} as any)
  }
}

/**
 * Resolves and loads one virtual module from the plugin.
 */
async function runLoad(plugin: Plugin, id: string): Promise<string> {
  const resolved = typeof plugin.resolveId === 'function'
    ? await (plugin.resolveId as any).call({} as any, id, undefined, {} as any)
    : id
  const code = typeof plugin.load === 'function'
    ? await (plugin.load as any).call({} as any, String(resolved ?? id), {} as any)
    : undefined

  return String(code ?? '')
}
