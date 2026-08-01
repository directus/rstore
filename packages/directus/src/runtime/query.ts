import type { Query } from '@directus/sdk'
import { createConnectorQuery } from '@rstore/connector-toolkit'

export { stripPrimaryKeys } from '@rstore/connector-toolkit'

/**
 * Directus REST query options supported by the Directus adapter.
 */
export interface DirectusQueryOptions extends Omit<Query<any, any>, 'filter'> {
  /**
   * Directus filter object forwarded to the REST API.
   */
  filter?: Record<string, any>

  /**
   * Whether Directus should follow reverse relations in wildcard fields.
   */
  backlink?: boolean

  /**
   * Content version key used by Directus versioned reads.
   */
  version?: string

  /**
   * Return the raw version delta instead of the resolved version item.
   */
  versionRaw?: boolean
}

/**
 * rstore find options with Directus-specific top-level query options.
 */
export interface DirectusFindOptions extends DirectusQueryOptions {
  /**
   * rstore page index used by paginated queries.
   */
  pageIndex?: number

  /**
   * rstore page size used by paginated queries.
   */
  pageSize?: number

  /**
   * Adapter-specific params. Directus accepts the same query keys here for
   * compatibility with rstore's generic `params` extension point.
   */
  params?: DirectusQueryOptions
}

const DIRECTUS_QUERY_KEYS = [
  'fields',
  'filter',
  'search',
  'sort',
  'limit',
  'offset',
  'page',
  'deep',
  'alias',
  'backlink',
  'version',
  'versionRaw',
] as const

/**
 * Creates a Directus SDK query from rstore find options.
 */
export function createDirectusQuery(
  findOptions?: DirectusFindOptions,
  overrides: DirectusQueryOptions = {},
): DirectusQueryOptions {
  return createConnectorQuery<DirectusQueryOptions>(findOptions, overrides, {
    knownKeys: DIRECTUS_QUERY_KEYS,
    // An explicit Directus `page` option already paginates the query.
    respectPageOption: true,
  })
}
