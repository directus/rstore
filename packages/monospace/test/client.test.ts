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
    expect(String(url)).toContain('https://example.monospace.io/api/blog/items/Todos?')
    expect(String(url)).toContain('filter%5Bid%5D%5B_in%5D%5B0%5D=1')
    expect(String(url)).toContain('fields=id%2Ccompleted')
    expect(init).toMatchObject({
      body: JSON.stringify({ completed: true }),
      method: 'PATCH',
    })
  })

  it('reads composite-key items through a filtered collection request', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ shop_id: 1, code: 'A' }] }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.readOne('Orders', { shop_id: 1, code: 'A' }, { fields: ['*'] })).resolves.toEqual({ shop_id: 1, code: 'A' })
    await expect(client.readOne('Orders', { shop_id: 1, code: 'B' })).resolves.toBeNull()

    const url = decodeURIComponent(String(fetchMock.mock.calls[0]![0]))
    expect(url).toMatch(/\/api\/blog\/items\/Orders\?/)
    expect(url).toContain('filter[shop_id][_eq]=1')
    expect(url).toContain('filter[code][_eq]=A')
    expect(url).toContain('limit=1')
    expect(url).toContain('fields=*')
  })

  it('updates and deletes composite-key items through filtered collection requests', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ shop_id: 1, code: 'A', total: 2 }] }))
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    await expect(client.updateOne('Orders', { shop_id: 1, code: 'A' }, { total: 2 }, { fields: ['*'] })).resolves.toEqual({
      shop_id: 1,
      code: 'A',
      total: 2,
    })
    await client.deleteOne('Orders', { shop_id: 1, code: 'A' })

    const [updateUrl, updateInit] = fetchMock.mock.calls[0]!
    expect(decodeURIComponent(String(updateUrl))).toMatch(/\/items\/Orders\?.*filter\[shop_id\]\[_eq\]=1.*filter\[code\]\[_eq\]=A/)
    expect(updateInit).toMatchObject({ body: JSON.stringify({ total: 2 }), method: 'PATCH' })
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1]!
    expect(decodeURIComponent(String(deleteUrl))).toMatch(/\/items\/Orders\?filter\[shop_id\]\[_eq\]=1&filter\[code\]\[_eq\]=A$/)
    expect(deleteInit).toMatchObject({ method: 'DELETE' })
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
