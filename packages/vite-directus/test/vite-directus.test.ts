import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSchema, runBuildStart, runConfigResolved, runLoad } from '../../vite-monospace/test/utils/vite'

const fixtures = vi.hoisted(() => ({
  request: vi.fn(),
  clients: [] as Array<{ url: string, token?: string }>,
}))

vi.mock('@directus/sdk', async () => {
  const sdk = (await import('../../directus/test/utils/sdk-mocks')).directusSdkMocks()
  return {
    ...sdk,
    readCollections: () => ({ op: 'readCollections', args: [] }),
    readFieldsByCollection: (collection: string) => ({ op: 'readFieldsByCollection', args: [collection] }),
    readRelations: () => ({ op: 'readRelations', args: [] }),
    staticToken: (token: string) => ({ token }),
    createDirectus: (url: string) => {
      const client = {
        url,
        token: undefined as string | undefined,
        request: fixtures.request,
        /** Records schema credentials supplied through SDK middleware. */
        with(extension: { token?: string }) {
          client.token ??= extension.token
          return client
        },
      }
      fixtures.clients.push(client)
      return client
    },
  }
})

beforeEach(() => {
  fixtures.clients.length = 0
  fixtures.request.mockReset().mockImplementation(async ({ op, args }) => {
    if (op === 'readCollections') {
      return [{ collection: 'Todos', schema: { name: 'Todos' }, meta: {} }]
    }
    if (op === 'readFieldsByCollection' && args[0] === 'Todos') {
      return [
        { collection: 'Todos', field: 'id', type: 'integer', schema: { is_primary_key: true, is_nullable: false } },
        { collection: 'Todos', field: 'title', type: 'string', schema: { is_primary_key: false, is_nullable: false } },
      ]
    }
    if (op === 'readRelations') {
      return []
    }
    throw new Error(`Unexpected Directus metadata request: ${op}`)
  })
})

const tempDirs: string[] = []

afterEach(async () => {
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

  it('resolves generated modules with Vite internal IDs', async () => {
    const { rstoreDirectus } = await import('../src')
    const plugin = rstoreDirectus({
      url: 'https://directus.example.com',
      adminToken: 'secret-admin-token',
      scopeId: 'test-scope',
    })

    expect(await (plugin.resolveId as any).call({}, 'virtual:rstore-directus/schema', undefined, {})).toBe('\0virtual:rstore-directus/schema')
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

    expect(fixtures.clients).toEqual([expect.objectContaining({ url: 'https://directus.example.com', token: 'secret-admin-token' })])
    expect(fixtures.request.mock.calls.map(([command]) => command)).toEqual([
      { op: 'readCollections', args: [] },
      { op: 'readFieldsByCollection', args: ['Todos'] },
      { op: 'readRelations', args: [] },
    ])
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
    const schema = await buildSchema(root, rstoreDirectus({
      url: 'https://directus.example.com',
      adminToken: 'secret-admin-token',
      scopeId: 'test-scope',
    }), 'virtual:rstore-directus/schema')

    expect(schema.map(collection => collection.name)).toEqual(['Todos'])
    expect(schema[0].getKey({ id: 0, title: 'Zero' })).toBe(0)
    expect(schema[0].scopeId).toBe('test-scope')
    expect(schema[0].meta).toEqual({ primaryKeys: ['id'], directus: { collection: 'Todos', singleton: false } })
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
