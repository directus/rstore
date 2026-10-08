import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMonospaceRestClient,
  MonospaceAuthError,
  MonospaceNotFoundError,
  MonospacePermissionError,
  MonospaceRestError,
  MonospaceValidationError,
} from '../src'
import { jsonResponse } from './utils/http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
})

/** Checks exact conjunction operands and other query options without ordering them. */
function expectConjunctiveQuery(params: URLSearchParams, clauses: Array<Record<string, string>>, query: Record<string, string>): void {
  const groups = new Map<string, Record<string, string>>()
  const otherParams: Array<[string, string]> = []
  for (const [name, value] of params) {
    const match = /^filter\[_and\]\[(\d+)\](.+)$/.exec(name)
    if (!match) {
      otherParams.push([name, value])
      continue
    }
    const group = groups.get(match[1]!) ?? {}
    group[match[2]!] = value
    groups.set(match[1]!, group)
  }
  expect(Object.fromEntries(otherParams)).toEqual(query)
  expect([...groups.values()]).toHaveLength(clauses.length)
  expect([...groups.values()]).toEqual(expect.arrayContaining(clauses))
  // Reject duplicate parameters as well as extra or omitted operands.
  expect([...params]).toHaveLength(Object.keys(query).length + clauses.reduce((count, clause) => count + Object.keys(clause).length, 0))
}

describe('createMonospaceRestClient', () => {
  it('builds workspace-scoped item requests with auth headers and unwraps envelopes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, title: 'Todo' }] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io/',
      workspace: 'blog',
      apiKey: 'runtime-token',
      fetch: fetchMock,
    })

    const result = await client.readMany('Todos', {
      fields: ['id', 'title'],
      filter: { completed: { _eq: false } },
      sort: [{ title: { direction: 'asc' } }],
      limit: 10,
      offset: 20,
    })

    expect(result).toEqual([{ id: 1, title: 'Todo' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('https://example.monospace.io/api/blog/items/Todos?')
    expect(String(url)).toContain('fields=id%2Ctitle')
    expect(String(url)).toContain('filter%5Bcompleted%5D%5B_eq%5D=false')
    expect(String(url)).toContain('sort%5B0%5D%5Btitle%5D%5Bdirection%5D=asc')
    expect(String(url)).toContain('limit=10')
    expect(String(url)).toContain('offset=20')
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer runtime-token',
    })
  })

  it('posts createOne as a one-item array and returns the first result item', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 7, title: 'Created' }] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.createOne('Todos', { title: 'Created' })).resolves.toEqual({
      id: 7,
      title: 'Created',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.monospace.io/api/blog/items/Todos',
      expect.objectContaining({
        body: JSON.stringify([{ title: 'Created' }]),
        method: 'POST',
      }),
    )
  })

  it('patches updateMany with one shared body and a filter query', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, completed: true }] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.updateMany('Todos', { completed: true }, {
      filter: {
        id: {
          _in: [1, 2],
        },
      },
      fields: ['id', 'completed'],
    })).resolves.toEqual([{ id: 1, completed: true }])

    const [url, init] = fetchMock.mock.calls[0]!
    const request = new URL(String(url))
    expect(request.pathname).toBe('/api/blog/items/Todos')
    expect(Object.fromEntries(request.searchParams)).toEqual({
      'fields': 'id,completed',
      'filter[id][_in][0]': expect.any(String),
      'filter[id][_in][1]': expect.any(String),
    })
    expect([...request.searchParams]).toHaveLength(3)
    expect([request.searchParams.get('filter[id][_in][0]'), request.searchParams.get('filter[id][_in][1]')].sort()).toEqual(['1', '2'])
    expect(init).toMatchObject({
      body: JSON.stringify({ completed: true }),
      method: 'PATCH',
    })
  })

  it.each(['GET', 'PATCH', 'DELETE'] as const)('targets item zero for %s instead of the whole collection', async (method) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 0, title: 'Zero' } }))
    const client = createMonospaceRestClient({ url: 'https://example.monospace.io', workspace: 'blog', fetch: fetchMock })
    const query = { fields: ['id', 'title'] }
    if (method === 'GET') {
      await expect(client.readOne('Todos', 0, query)).resolves.toEqual({ id: 0, title: 'Zero' })
    }
    else if (method === 'PATCH') {
      await expect(client.updateOne('Todos', 0, { title: 'Zero' }, query)).resolves.toEqual({ id: 0, title: 'Zero' })
    }
    else {
      await expect(client.deleteOne('Todos', 0, query)).resolves.toBeUndefined()
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://example.monospace.io/api/blog/items/Todos/0?fields=id%2Ctitle')
    expect(init.method).toBe(method)
    expect(init.body).toBe(method === 'PATCH' ? JSON.stringify({ title: 'Zero' }) : undefined)
  })

  it('reads composite-key items without dropping caller filter constraints', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ shop_id: 1, code: 'B' }] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    const query = { fields: ['*'], filter: { shop_id: { _eq: 2 } } }
    await expect(client.readOne('Orders', { shop_id: 1, code: 'A' }, query)).resolves.toBeNull()
    await expect(client.readOne('Orders', { shop_id: 1, code: 'B' })).resolves.toEqual({ shop_id: 1, code: 'B' })

    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.pathname).toBe('/api/blog/items/Orders')
    // Even a conflicting caller constraint must survive; a key cannot
    // broaden the requested selection by overwriting that constraint.
    expectConjunctiveQuery(url.searchParams, [
      { '[shop_id][_eq]': '2' },
      { '[shop_id][_eq]': '1', '[code][_eq]': 'A' },
    ], { fields: '*', limit: '1' })
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET' })
    const secondRequest = new URL(String(fetchMock.mock.calls[1]![0]))
    expect(secondRequest.pathname).toBe('/api/blog/items/Orders')
    expect(Object.fromEntries(secondRequest.searchParams)).toEqual({
      'filter[shop_id][_eq]': '1',
      'filter[code][_eq]': 'B',
      'limit': '1',
    })
    expect([...secondRequest.searchParams]).toHaveLength(3)
    expect(query).toEqual({ fields: ['*'], filter: { shop_id: { _eq: 2 } } })
  })

  it('updates and deletes composite-key items only within caller filter constraints', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ shop_id: 1, code: 'A', total: 2 }] }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    const filter = { total: { _gt: 0 } }
    await expect(client.updateOne('Orders', { shop_id: 1, code: 'A' }, { total: 2 }, { fields: ['*'], filter })).resolves.toEqual({
      shop_id: 1,
      code: 'A',
      total: 2,
    })
    await client.deleteOne('Orders', { shop_id: 1, code: 'A' }, { filter })

    const [updateUrl, updateInit] = fetchMock.mock.calls[0]!
    const updateRequest = new URL(String(updateUrl))
    expect(updateRequest.pathname).toBe('/api/blog/items/Orders')
    expectConjunctiveQuery(updateRequest.searchParams, [
      { '[total][_gt]': '0' },
      { '[shop_id][_eq]': '1', '[code][_eq]': 'A' },
    ], { fields: '*' })
    expect(updateInit).toMatchObject({ body: JSON.stringify({ total: 2 }), method: 'PATCH' })
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1]!
    const deleteRequest = new URL(String(deleteUrl))
    expect(deleteRequest.pathname).toBe('/api/blog/items/Orders')
    expectConjunctiveQuery(deleteRequest.searchParams, [
      { '[total][_gt]': '0' },
      { '[shop_id][_eq]': '1', '[code][_eq]': 'A' },
    ], {})
    expect(deleteInit).toMatchObject({ method: 'DELETE' })
    expect(filter).toEqual({ total: { _gt: 0 } })
  })

  it('sends the Cache-Control header only when configured', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [] }))
    const defaultClient = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })
    const noCacheClient = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      cacheControl: 'no-cache',
      fetch: fetchMock,
    })

    await defaultClient.readMany('Todos')
    await noCacheClient.readMany('Todos')

    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty('Cache-Control')
    expect(fetchMock.mock.calls[1]![1].headers).toMatchObject({ 'Cache-Control': 'no-cache' })
  })

  it('rejects bulk mutations whose filter serializes to an empty query', async () => {
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.updateMany('Todos', { completed: true }, {
      filter: {
        id: {
          _in: [],
        },
      },
    })).rejects.toThrow('non-empty filter')
    await expect(client.deleteMany('Todos', {} as any)).rejects.toThrow('non-empty filter')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps 422 responses to validation errors and surfaces error details', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      message: 'Failed to execute query',
      code: '4009',
      source: { message: 'Query parsing failed' },
      meta: { path: [] },
    }, 422))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    const error = await client.readOne('Todos', 1).then(() => null, e => e)
    expect(error).toBeInstanceOf(MonospaceValidationError)
    expect(error.message).toBe('Failed to execute query: Query parsing failed')
    expect(error.status).toBe(422)
    expect(error.code).toBe('4009')
    expect(error.source).toEqual({ message: 'Query parsing failed' })
    expect(error.meta).toEqual({ path: [] })
  })

  it.each([
    [400, MonospaceValidationError],
    [401, MonospaceAuthError],
    [403, MonospacePermissionError],
    [404, MonospaceNotFoundError],
    [500, MonospaceRestError],
  ])('maps %i responses to typed errors', async (status, errorClass) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Nope' }, status))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.readOne('Todos', 1)).rejects.toBeInstanceOf(errorClass)
  })
})
