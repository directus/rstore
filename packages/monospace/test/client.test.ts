import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMonospaceRestClient,
  MonospaceAuthError,
  MonospaceNotFoundError,
  MonospacePermissionError,
  MonospaceRestError,
  MonospaceValidationError,
} from '../src'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
})

describe('createMonospaceRestClient', () => {
  it('builds project-scoped item requests with auth headers and unwraps envelopes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, title: 'Todo' }] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io/',
      project: 'blog',
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
      project: 'blog',
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
      project: 'blog',
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

  it('rejects bulk mutations whose filter serializes to an empty query', async () => {
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      project: 'blog',
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
      project: 'blog',
      fetch: fetchMock,
    })

    await expect(client.readOne('Todos', 1)).rejects.toBeInstanceOf(errorClass)
  })
})

/**
 * Creates a minimal fetch `Response` for REST client tests.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}
