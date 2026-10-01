import type { MonospaceItemKey } from './clientUtils'
import type { MonospaceQueryOptions } from './query'
import type { MonospaceWorkspaceOptions } from './workspace'
import {
  assertBulkMutationFilter,
  createItemUrl,
  firstItem,
  isMonospaceKeyObject,
  readResponseBody,
  trimTrailingSlash,
  unwrapEnvelope,
  withMonospaceKeyFilter,
} from './clientUtils'
import { createMonospaceError } from './errors'
import { resolveMonospaceWorkspace } from './workspace'

export type { MonospaceItemKey } from './clientUtils'

/**
 * Fetch function accepted by the Monospace REST client.
 */
export type MonospaceFetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Options used to create a Monospace REST client.
 */
export interface CreateMonospaceRestClientOptions extends MonospaceWorkspaceOptions {
  /**
   * Base URL of the Monospace instance.
   */
  url: string

  /**
   * Optional runtime API key.
   */
  apiKey?: string

  /**
   * Fetch implementation used by the client.
   */
  fetch?: MonospaceFetch

  /**
   * `Cache-Control` request header sent with every request. `'no-cache'`
   * bypasses the Monospace server-side read cache. Not sent by default.
   */
  cacheControl?: 'no-cache' | 'no-store'
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
   * Reads one item by key. Object keys read through a filtered collection
   * request and resolve to `null` when no item matches.
   */
  readOne: (collection: string, key: MonospaceItemKey, query?: MonospaceQueryOptions) => Promise<any>

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
   * Updates one item by key. Object keys update through a filtered
   * collection request.
   */
  updateOne: (collection: string, key: MonospaceItemKey, item: Record<string, any>, query?: MonospaceQueryOptions) => Promise<any>

  /**
   * Updates many filtered items with a shared request body.
   */
  updateMany: (collection: string, item: Record<string, any>, query: MonospaceBulkMutationQueryOptions) => Promise<any[]>

  /**
   * Deletes one item by key. Object keys delete through a filtered
   * collection request.
   */
  deleteOne: (collection: string, key: MonospaceItemKey, query?: MonospaceQueryOptions) => Promise<void>

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
  const workspace = resolveMonospaceWorkspace(options)
  if (!workspace) {
    throw new Error('Monospace workspace is required to create the Monospace REST client')
  }
  const baseUrl = `${trimTrailingSlash(options.url)}/api/${encodeURIComponent(workspace)}`

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

  const client: MonospaceRestClient = {
    async readOne(collection, key, query) {
      if (isMonospaceKeyObject(key)) {
        return firstItem(await request('GET', collection, { query: withMonospaceKeyFilter({ ...query, limit: 1 }, key) }))
      }
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
      if (isMonospaceKeyObject(key)) {
        return firstItem(await client.updateMany(collection, item, withMonospaceKeyFilter(query, key)))
      }
      return await request('PATCH', collection, { body: item, key, query })
    },

    async updateMany(collection, item, query) {
      assertBulkMutationFilter(query)
      return await request('PATCH', collection, { body: item, query })
    },

    async deleteOne(collection, key, query) {
      if (isMonospaceKeyObject(key)) {
        await client.deleteMany(collection, withMonospaceKeyFilter(query, key))
        return
      }
      await request('DELETE', collection, { key, query })
    },

    async deleteMany(collection, query) {
      assertBulkMutationFilter(query)
      await request('DELETE', collection, { query })
    },
  }
  return client

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
    if (options.cacheControl) {
      headers['Cache-Control'] = options.cacheControl
    }
    return headers
  }
}
