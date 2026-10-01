import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadLocalSchemaMetadata,
  loadMonospaceCollections,
  loadRemoteOpenApiDocument,
  loadRemoteSchemaMetadata,
} from '../src/schema'
import { jsonResponse } from './utils/http'
import { createSchemaMetadataFixture } from './utils/metadata'
import { createOpenApiFixture } from './utils/openapi'
import { createStructureResponseFixture } from './utils/structure'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
})

describe('loadRemoteOpenApiDocument', () => {
  it('loads the workspace OpenAPI document with the schema API key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(createOpenApiFixture()))

    const document = await loadRemoteOpenApiDocument({
      fetch: fetchMock,
      workspace: 'blog',
      schemaApiKey: 'schema-token',
      url: 'https://example.monospace.io',
    })

    expect(document.openapi).toBe('3.1.0')
    expect(fetchMock).toHaveBeenCalledWith('https://example.monospace.io/api/blog/openapi', {
      headers: {
        Authorization: 'Bearer schema-token',
      },
    })
  })

  it('accepts the deprecated project option as the workspace', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(createOpenApiFixture()))

    await loadRemoteOpenApiDocument({
      fetch: fetchMock,
      project: 'legacy',
      url: 'https://example.monospace.io',
    })

    expect(fetchMock).toHaveBeenCalledWith('https://example.monospace.io/api/legacy/openapi', { headers: {} })
  })

  it('reports HTTP errors even when the body is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>Not found</html>', { status: 404 }))

    await expect(loadRemoteOpenApiDocument({
      fetch: fetchMock,
      workspace: 'blog',
      url: 'https://example.monospace.io',
    })).rejects.toThrow('Failed to load Monospace OpenAPI schema: 404')
  })
})

describe('loadRemoteSchemaMetadata', () => {
  it('loads the schema structure in one request and flattens it into a metadata snapshot', async () => {
    const fetchMock = vi.fn(createRemoteFetchMock())

    const metadata = await loadRemoteSchemaMetadata({
      fetch: fetchMock,
      workspace: 'blog',
      schemaApiKey: 'schema-token',
      url: 'https://example.monospace.io',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/^https:\/\/example\.monospace\.io\/api\/blog\/schema\/structure\/sources\?/)
    expect(init).toEqual({ headers: { Authorization: 'Bearer schema-token' } })
    // The snapshot matches the flat meta collection items it was built from.
    expect(metadata).toEqual(createSchemaMetadataFixture())
  })

  it('selects explicit fields and lifts the default page size at every to-many level', async () => {
    const fetchMock = vi.fn(createRemoteFetchMock())

    await loadRemoteSchemaMetadata({ fetch: fetchMock, workspace: 'blog', url: 'https://example.monospace.io' })

    const search = new URL(String(fetchMock.mock.calls[0]![0])).searchParams
    // Wildcards would select the encrypted data source credentials.
    for (const [key, value] of search) {
      expect(value, key).not.toContain('*')
    }
    expect(search.get('fields')).toBe('id')
    const toManyIncludes = [
      'include[collections]',
      'include[collections][include][primitiveFields]',
      'include[collections][include][relationFields]',
      'include[collections][include][relationFields][include][constraint][include][fieldMappings]',
      'include[collections][include][indexes]',
      'include[collections][include][indexes][include][fields]',
    ]
    for (const include of toManyIncludes) {
      // To-many includes default to 100 items per parent; -1 is unlimited.
      expect(search.get(`${include}[limit]`), include).toBe('-1')
      expect(search.get(`${include}[fields]`), include).toBeTruthy()
    }
  })

  it('reports structure request errors with the required entitlement', async () => {
    const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }))

    await expect(loadRemoteSchemaMetadata({
      fetch: fetchMock,
      workspace: 'blog',
      url: 'https://example.monospace.io',
    })).rejects.toThrow(/Failed to load Monospace schema metadata: 403.*dataModel:read/)
  })

  it('requires remote connection options', async () => {
    await expect(loadRemoteSchemaMetadata({})).rejects.toThrow(
      'requires url and workspace options to load the remote Monospace schema metadata',
    )
  })
})

describe('loadLocalSchemaMetadata', () => {
  it('reads and validates a local metadata snapshot', async () => {
    const dir = await createTempDir()
    const file = join(dir, 'schema-metadata.json')
    await writeFile(file, JSON.stringify(createSchemaMetadataFixture()))

    const metadata = await loadLocalSchemaMetadata(file)
    expect(metadata.MonospaceCollection.map(item => item.apiName)).toContain('Orders')
  })

  it('rejects files that are not metadata snapshots', async () => {
    const dir = await createTempDir()
    const file = join(dir, 'not-metadata.json')
    await writeFile(file, JSON.stringify(createOpenApiFixture()))

    await expect(loadLocalSchemaMetadata(file)).rejects.toThrow(
      /Expected Monospace schema metadata/,
    )
  })
})

describe('loadMonospaceCollections', () => {
  it('loads the OpenAPI document and the schema metadata remotely', async () => {
    const fetchMock = vi.fn(createRemoteFetchMock())

    const collections = await loadMonospaceCollections({
      fetch: fetchMock,
      workspace: 'blog',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    // One OpenAPI request plus one schema structure request.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(collections.map(collection => collection.name)).toEqual(['Todos', 'Profiles', 'Orders', 'OrderItems'])
    expect(collections[0]?.relations.author).toEqual({
      to: { Profiles: { on: { email: 'author_id' } } },
    })
  })

  it('loads local OpenAPI and metadata snapshots without remote options', async () => {
    const dir = await createTempDir()
    const input = join(dir, 'openapi.json')
    const metadataInput = join(dir, 'schema-metadata.json')
    await writeFile(input, JSON.stringify(createOpenApiFixture()))
    await writeFile(metadataInput, JSON.stringify(createSchemaMetadataFixture()))

    const collections = await loadMonospaceCollections({
      input,
      metadataInput,
      scopeId: 'test-scope',
    })

    expect(collections.map(collection => collection.name)).toEqual(['Todos', 'Profiles', 'Orders', 'OrderItems'])
  })

  it('rejects local OpenAPI input without a metadata source', async () => {
    const dir = await createTempDir()
    const input = join(dir, 'openapi.json')
    await writeFile(input, JSON.stringify(createOpenApiFixture()))

    await expect(loadMonospaceCollections({
      input,
      scopeId: 'test-scope',
    })).rejects.toThrow('requires url and workspace options to load the remote Monospace schema metadata')
  })
})

/**
 * Creates a fetch mock serving the OpenAPI document and the schema
 * structure response.
 */
function createRemoteFetchMock(): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/openapi')) {
      return jsonResponse(createOpenApiFixture())
    }
    if (url.includes('/schema/structure/sources?')) {
      return jsonResponse(createStructureResponseFixture(createSchemaMetadataFixture()))
    }
    return new Response('not found', { status: 404 })
  }
}

/**
 * Creates and tracks a temporary directory.
 */
async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rstore-monospace-load-'))
  tempDirs.push(dir)
  return dir
}
