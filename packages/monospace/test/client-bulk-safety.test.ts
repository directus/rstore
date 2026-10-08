import type { MonospaceBulkMutationQueryOptions } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { createMonospaceRestClient, MonospaceValidationError } from '../src'
import { jsonResponse } from './utils/http'

describe('monospace bulk mutation safety', () => {
  it.each([
    ['missing filter', {}],
    ['empty filter', { filter: {} }],
    ['empty IDs', { filter: { id: { _in: [] } } }],
    ['empty conjunction', { filter: { _and: [] } }],
  ])('rejects %s before HTTP, including when fields are requested', async (_, query) => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ data: [] }))
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })

    for (const options of [query, { ...query, fields: ['id'] }]) {
      // JavaScript consumers can omit the required filter; typed empty filters
      // are also valid inputs to this runtime safety boundary.
      const bulkQuery = options as MonospaceBulkMutationQueryOptions
      const update = client.updateMany('Todos', { completed: true }, bulkQuery)
      await expect.soft(update)
        .rejects
        .toBeInstanceOf(MonospaceValidationError)
      await expect.soft(update)
        .rejects
        .toThrow('Monospace bulk mutations require a non-empty filter')
      await expect.soft(client.deleteMany('Todos', bulkQuery))
        .rejects
        .toThrow('Monospace bulk mutations require a non-empty filter')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('permits zero and false constraints after rejecting an empty filter', async () => {
    const fetchMock = vi.fn()
    const client = createMonospaceRestClient({
      url: 'https://example.monospace.io',
      workspace: 'blog',
      fetch: fetchMock,
    })
    await expect(client.deleteMany('Todos', { filter: {} }))
      .rejects
      .toBeInstanceOf(MonospaceValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 0, completed: true }] }))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const query = { filter: { id: { _eq: 0 }, completed: { _eq: false } }, fields: ['id', 'completed'] }

    await expect(client.updateMany('Todos', { completed: true }, query))
      .resolves
      .toEqual([{ id: 0, completed: true }])
    await expect(client.deleteMany('Todos', query)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, init] of fetchMock.mock.calls) {
      const request = new URL(String(url))
      expect(request.origin).toBe('https://example.monospace.io')
      expect(request.pathname).toBe('/api/blog/items/Todos')
      expect([...request.searchParams]).toHaveLength(3)
      expect(Object.fromEntries(request.searchParams)).toEqual({
        'filter[id][_eq]': '0',
        'filter[completed][_eq]': 'false',
        'fields': 'id,completed',
      })
      expect(init.headers).toMatchObject({ Accept: 'application/json' })
    }
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ completed: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(fetchMock.mock.calls[1]![1].method).toBe('DELETE')
    expect(fetchMock.mock.calls[1]![1].body).toBeUndefined()
    expect(query).toEqual({ filter: { id: { _eq: 0 }, completed: { _eq: false } }, fields: ['id', 'completed'] })
  })
})
