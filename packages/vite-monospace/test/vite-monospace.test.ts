import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { jsonResponse } from '../../monospace/test/utils/http'
import { createStructureResponseFixture } from '../../monospace/test/utils/structure'
import { buildSchema, importSchema, runBuildStart, runConfigResolved, runLoad } from './utils/vite'

let document: any
let metadata: any
const fetchMock = vi.fn()

beforeEach(async () => {
  const fixtureRoot = new URL('../../nuxt-monospace/test/fixtures/basic/openapi/', import.meta.url)
  // Retain the original generated relation's punctuation-bearing FK name.
  document = JSON.parse((await readFile(new URL('schema.json', fixtureRoot), 'utf8')).replaceAll('author_id', 'author$id'))
  metadata = JSON.parse((await readFile(new URL('schema-metadata.json', fixtureRoot), 'utf8')).replaceAll('author_id', 'author$id'))
  fetchMock.mockReset().mockImplementation(async (input: string) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/openapi')) {
      return jsonResponse(document)
    }
    if (url.pathname.endsWith('/schema/structure/sources')) {
      return jsonResponse(createStructureResponseFixture(metadata))
    }
    throw new Error(`Unexpected Monospace metadata request: ${input}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, {
    force: true,
    recursive: true,
  })))
})

describe('rstoreMonospace', () => {
  it('throws a clear error when required remote options are missing', async () => {
    const { rstoreMonospace } = await import('../src')
    const plugin = rstoreMonospace({})

    await expect(runBuildStart(plugin)).rejects.toThrow('@rstore/vite-monospace requires url and workspace options to load the remote Monospace schema, or both input and metadataInput for local generation')
  })

  it('rejects local OpenAPI input without a metadata snapshot or remote options', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const plugin = rstoreMonospace({
      input: './openapi.json',
      scopeId: 'test-scope',
    })

    runConfigResolved(plugin, root)
    // Schema generation requires the metadata queries: a lone OpenAPI file
    // is not sufficient anymore.
    await expect(runBuildStart(plugin)).rejects.toThrow(/remote Monospace schema metadata, or both input and metadataInput/)
  })

  it('loads local OpenAPI and metadata inputs without requiring remote schema options', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    runConfigResolved(plugin, root)
    await runBuildStart(plugin)

    expect(fetchMock).not.toHaveBeenCalled()
    const schema = await importSchema(plugin, 'virtual:rstore-monospace/schema')
    expect(schema.map(collection => collection.name)).toEqual(['Todos', 'Profiles'])
    expect(schema[0].getKey({ id: 0 })).toBe(0)
    expect(schema[0].scopeId).toBe('test-scope')
    expect(schema[0].relations.author.to).toEqual({ Profiles: { on: { id: 'author$id' } } })
  })

  it('generates virtual schema, plugin, index, and declarations without leaking schema credentials', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const plugin = rstoreMonospace({
      workspace: 'blog',
      runtimeApiKey: 'public-runtime-token',
      cacheControl: 'no-cache',
      schemaApiKey: 'secret-schema-token',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    runConfigResolved(plugin, root)
    await runBuildStart(plugin)

    const indexCode = await runLoad(plugin, 'virtual:rstore-monospace')
    const schemaCode = await runLoad(plugin, 'virtual:rstore-monospace/schema')
    const pluginCode = await runLoad(plugin, 'virtual:rstore-monospace/plugin')
    const declarations = await readFile(join(root, 'rstore-monospace.d.ts'), 'utf8')

    expect(fetchMock.mock.calls.map(([input]) => new URL(input).pathname).sort()).toEqual([
      '/api/blog/openapi',
      '/api/blog/schema/structure/sources',
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual({ headers: { Authorization: 'Bearer secret-schema-token' } })
    }
    expect(indexCode).toContain('virtual:rstore-monospace/schema')
    expect(schemaCode).toContain('export const schema')
    expect(pluginCode).toContain('createMonospaceRestClient')
    expect(pluginCode).toContain('workspace: "blog"')
    expect(pluginCode).toContain('public-runtime-token')
    expect(pluginCode).toContain('cacheControl: "no-cache"')
    expect(indexCode).not.toContain('secret-schema-token')
    expect(schemaCode).not.toContain('secret-schema-token')
    expect(pluginCode).not.toContain('secret-schema-token')
    expect(declarations).toContain('declare module \'virtual:rstore-monospace/schema\'')
    expect(declarations).toContain('export interface Todos')
    expect(declarations).toContain('"Profiles":{"on":{"id":"author$id"}}}')
    expect(schemaCode).toContain('"Profiles":{"on":{"id":"author$id"}}}')
  })

  it('accepts the deprecated project option as the workspace', async () => {
    const { rstoreMonospace } = await import('../src')
    const plugin = rstoreMonospace({
      project: 'legacy',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    runConfigResolved(plugin, await createTempRoot())
    await runBuildStart(plugin)

    expect(fetchMock.mock.calls.map(([input]) => new URL(input).pathname).sort()).toEqual([
      '/api/legacy/openapi',
      '/api/legacy/schema/structure/sources',
    ])
    expect(await runLoad(plugin, 'virtual:rstore-monospace/plugin')).toContain('workspace: "legacy"')
  })

  it('watches the local schema inputs and reloads collections when they change', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const input = join(root, 'openapi.json')
    const metadataInput = join(root, 'schema-metadata.json')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    runConfigResolved(plugin, root)
    expect(await runBuildStart(plugin)).toEqual([input, metadataInput])
    expect((await importSchema(plugin, 'virtual:rstore-monospace/schema'))[0].getKey({ id: 7 })).toBe(7)
    await writeFile(metadataInput, JSON.stringify({ ...metadata, MonospaceSingleConstraintField: [{ ...metadata.MonospaceSingleConstraintField[0], constrainedFieldId: 'pf_todos_title' }] }))

    const watchChange = plugin.watchChange
    if (typeof watchChange === 'function') {
      ;(watchChange as any).call({}, metadataInput, { event: 'update' })
    }
    expect((await importSchema(plugin, 'virtual:rstore-monospace/schema'))[0].relations.author.to).toEqual({ Profiles: { on: { id: 'title' } } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalidates virtual modules when the dev server sees input changes', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const input = join(root, 'openapi.json')
    const plugin = rstoreMonospace({
      input: './openapi.json',
      metadataInput: './schema-metadata.json',
      scopeId: 'test-scope',
    })

    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [plugin],
      server: { middlewareMode: true, hmr: false },
    })
    onTestFinished(() => server.close())
    const original = await server.ssrLoadModule('virtual:rstore-monospace/schema')
    expect(original.default[0].getKey({ id: 7 })).toBe(7)
    expect(original.default[0].relations.author.to).toEqual({ Profiles: { on: { id: 'author$id' } } })
    const send = vi.spyOn(server.ws, 'send')
    // This targets the real watcher and module graph; no authored server stub.
    delete document.components.schemas.TodosCollectionOutput.properties.author
    await writeFile(input, JSON.stringify(document))
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'full-reload' }))
    await vi.waitFor(async () => {
      const changed = await server.ssrLoadModule('virtual:rstore-monospace/schema')
      expect(changed.default[0].relations, 'changed OpenAPI input must replace the cached virtual schema').toEqual({})
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('builds the virtual schema module as plain JavaScript', async () => {
    const { rstoreMonospace } = await import('../src')
    const root = await createTempRoot()
    const schema = await buildSchema(root, rstoreMonospace({
      workspace: 'blog',
      schemaApiKey: 'secret-schema-token',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    }), 'virtual:rstore-monospace/schema')
    expect(schema.map(collection => collection.name)).toEqual(['Todos', 'Profiles'])
    expect(schema[0].getKey({ id: 0 })).toBe(0)
    expect(schema[0].scopeId).toBe('test-scope')
    expect(schema[0].relations.author.to).toEqual({ Profiles: { on: { id: 'author$id' } } })
    expect(schema[1].getKey({ id: 'profile-1' })).toBe('profile-1')
  })
})

/**
 * Creates and tracks a temporary Vite root directory.
 */
async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rstore-vite-monospace-'))
  tempDirs.push(dir)
  await writeFile(join(dir, 'openapi.json'), JSON.stringify(document))
  await writeFile(join(dir, 'schema-metadata.json'), JSON.stringify(metadata))
  return dir
}
