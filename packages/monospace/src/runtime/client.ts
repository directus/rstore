import type { MonospaceQueryOptions } from './query'
import { createMonospaceError, MonospaceValidationError } from './errors'
import { serializeMonospaceQuery } from './query'

/**
 * Fetch function accepted by the Monospace REST client.
 */
export type MonospaceFetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Options used to create a Monospace REST client.
 */
export interface CreateMonospaceRestClientOptions {
  /**
   * Base URL of the Monospace instance.
   */
  url: string

  /**
   * Monospace project identifier.
   */
  project: string

  /**
   * Optional runtime API key.
   */
  apiKey?: string

  /**
   * Fetch implementation used by the client.
   */
  fetch?: MonospaceFetch
}

/**
 * Query options required by Monospace bulk mutation endpoints.
 */
export interface MonospaceBulkMutationQueryOptions extends MonospaceQueryOptions {
  /**
   * Filter that selects the items to update or delete.
   */
  filter: Record<string, any>
}

/**
 * Runtime REST client used by the rstore Monospace plugin.
 */
export interface MonospaceRestClient {
  /**
   * Reads one item by key.
   */
  readOne: (collection: string, key: string | number, query?: MonospaceQueryOptions) => Promise<any>

  /**
   * Reads many items.
   */
  readMany: (collection: string, query?: MonospaceQueryOptions) => Promise<any[]>

  /**
   * Creates one item.
   */
  createOne: (collection: string, item: Record<string, any>, query?: MonospaceQueryOptions) => Promise<any>

  /**
   * Creates many items.
   */
  createMany: (collection: string, items: Array<Record<string, any>>, query?: MonospaceQueryOptions) => Promise<any[]>

  /**
   * Updates one item by key.
   */
  updateOne: (collection: string, key: string | number, item: Record<string, any>, query?: MonospaceQueryOptions) => Promise<any>

  /**
   * Updates many filtered items with a shared request body.
   */
  updateMany: (collection: string, item: Record<string, any>, query: MonospaceBulkMutationQueryOptions) => Promise<any[]>

  /**
   * Deletes one item by key.
   */
  deleteOne: (collection: string, key: string | number, query?: MonospaceQueryOptions) => Promise<void>

  /**
   * Deletes many items with query filters.
   */
  deleteMany: (collection: string, query: MonospaceBulkMutationQueryOptions) => Promise<void>
}

/**
 * Creates the fetch-based Monospace REST client used by rstore.
 */
export function createMonospaceRestClient(options: CreateMonospaceRestClientOptions): MonospaceRestClient {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  const baseUrl = `${trimTrailingSlash(options.url)}/api/${encodeURIComponent(options.project)}`

  /**
   * Sends one REST request and unwraps the `{ data }` envelope when present.
   */
  async function request<T>(
    method: string,
    collection: string,
    options: {
      /**
       * Optional item key for item endpoints.
       */
      key?: string | number

      /**
       * Optional JSON request body.
       */
      body?: unknown

      /**
       * Optional query parameters.
       */
      query?: MonospaceQueryOptions
    } = {},
  ): Promise<T> {
    const url = createItemUrl(baseUrl, collection, options.key, options.query)
    const init: RequestInit = {
      headers: createHeaders(options.body),
      method,
    }

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body)
    }

    const response = await fetchFn(url, init)
    const body = await readResponseBody(response)
    if (!response.ok) {
      throw createMonospaceError(response.status, body, {
        collection,
        key: options.key,
      })
    }
    return unwrapEnvelope(body) as T
  }

  return {
    async readOne(collection, key, query) {
      return await request('GET', collection, { key, query })
    },

    async readMany(collection, query) {
      return await request('GET', collection, { query })
    },

    async createOne(collection, item, query) {
      const result = await request<any[]>('POST', collection, { body: [item], query })
      return result?.[0] ?? null
    },

    async createMany(collection, items, query) {
      return await request('POST', collection, { body: items, query })
    },

    async updateOne(collection, key, item, query) {
      return await request('PATCH', collection, { body: item, key, query })
    },

    async updateMany(collection, item, query) {
      assertBulkMutationFilter(query)
      return await request('PATCH', collection, { body: item, query })
    },

    async deleteOne(collection, key, query) {
      await request('DELETE', collection, { key, query })
    },

    async deleteMany(collection, query) {
      assertBulkMutationFilter(query)
      await request('DELETE', collection, { query })
    },
  }

  /**
   * Creates request headers for a Monospace REST call.
   */
  function createHeaders(body: unknown): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    return headers
  }
}

/**
 * Asserts that a bulk mutation cannot serialize to an unfiltered REST request.
 */
function assertBulkMutationFilter(query: MonospaceQueryOptions | undefined): void {
  const filterQuery = serializeMonospaceQuery({ filter: query?.filter }).toString()
  if (!filterQuery) {
    throw new MonospaceValidationError('Monospace bulk mutations require a non-empty filter')
  }
}

/**
 * Creates a Monospace item endpoint URL.
 */
function createItemUrl(
  baseUrl: string,
  collection: string,
  key: string | number | undefined,
  query: MonospaceQueryOptions | undefined,
): string {
  const itemPath = key == null ? '' : `/${encodeURIComponent(String(key))}`
  const url = `${baseUrl}/items/${encodeURIComponent(collection)}${itemPath}`
  const search = serializeMonospaceQuery(query).toString()
  return search ? `${url}?${search}` : url
}

/**
 * Removes one trailing slash from a URL.
 */
function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * Reads a REST response body as JSON when possible.
 */
async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined
  }
  const text = await response.text()
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/**
 * Unwraps a Monospace `{ data }` envelope when one is returned.
 */
function unwrapEnvelope(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: unknown }).data
  }
  return value
}
