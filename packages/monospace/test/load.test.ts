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
import { createSchemaMetadataFixture } from './utils/metadata'
import { createOpenApiFixture } from './utils/openapi'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
})

describe('loadRemoteOpenApiDocument', () => {
  it('loads the project OpenAPI document with the schema API key', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(createOpenApiFixture()))

    const document = await loadRemoteOpenApiDocument({
      fetch: fetchMock,
      project: 'blog',
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

  it('reports HTTP errors even when the body is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>Not found</html>', { status: 404 }))

    await expect(loadRemoteOpenApiDocument({
      fetch: fetchMock,
      project: 'blog',
      url: 'https://example.monospace.io',
    })).rejects.toThrow('Failed to load Monospace OpenAPI schema: 404')
  })
})

describe('loadRemoteSchemaMetadata', () => {
  it('queries the schema meta collections with explicit fields and unlimited limit', async () => {
    const fetchMock = vi.fn(createRemoteFetchMock())

    const metadata = await loadRemoteSchemaMetadata({
      fetch: fetchMock,
      project: 'blog',
      schemaApiKey: 'schema-token',
      url: 'https://example.monospace.io',
    })

    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toHaveLength(6)
    for (const name of [
      'MonospaceCollection',
      'MonospacePrimitiveField',
      'MonospaceSingleRelationField',
      'MonospaceSingleConstraintField',
      'MonospaceIndex',
      'MonospaceIndexField',
    ]) {
      const url = urls.find(entry => entry.includes(`/api/blog/items/${name}?`))
      expect(url, name).toBeDefined()
      const search = new URL(url!).searchParams
      // The default items limit is 100; limit=0 means unlimited.
      expect(search.get('limit')).toBe('0')
      expect(search.get('fields')).toBeTruthy()
    }
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        Authorization: 'Bearer schema-token',
      },
    })
    expect(metadata.MonospaceCollection.map(item => item.apiName)).toContain('Todos')
  })

  it('reports metadata query errors with the required entitlement', async () => {
    const fetchMock = vi.fn(async () => new Response('forbidden', { status: 403 }))

    await expect(loadRemoteSchemaMetadata({
      fetch: fetchMock,
      project: 'blog',
      url: 'https://example.monospace.io',
    })).rejects.toThrow(/Failed to load Monospace schema metadata \(\w+\): 403.*dataModel:read/)
  })

  it('requires remote connection options', async () => {
    await expect(loadRemoteSchemaMetadata({})).rejects.toThrow(
      'requires url and project options to load the remote Monospace schema metadata',
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
      project: 'blog',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
    })

    // One OpenAPI request plus one request per meta collection.
    expect(fetchMock).toHaveBeenCalledTimes(7)
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
    })).rejects.toThrow('requires url and project options to load the remote Monospace schema metadata')
  })
})

/**
 * Creates a fetch mock serving the OpenAPI document and metadata items.
 */
function createRemoteFetchMock(): (url: string, init?: RequestInit) => Promise<Response> {
  const metadata: Record<string, unknown[]> = { ...createSchemaMetadataFixture() } as any
  return async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/openapi')) {
      return jsonResponse(createOpenApiFixture())
    }
    const match = /\/items\/(\w+)\?/.exec(url)
    const items = match ? metadata[match[1]!] : undefined
    if (items) {
      // The items API wraps list responses in a `{ data }` envelope.
      return jsonResponse({ data: items })
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

/**
 * Creates a minimal fetch `Response` for schema loading tests.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}
