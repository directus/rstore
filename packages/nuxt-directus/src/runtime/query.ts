import type { Query } from '@directus/sdk'

/**
 * Directus REST query options supported by the Nuxt Directus adapter.
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
  const query: DirectusQueryOptions = {}

  assignDirectusQueryOptions(query, findOptions?.params)
  assignDirectusQueryOptions(query, findOptions)

  if (
    findOptions?.pageIndex != null
    && findOptions.pageSize != null
    && query.limit == null
    && query.offset == null
    && query.page == null
  ) {
    query.limit = findOptions.pageSize
    query.offset = findOptions.pageIndex * findOptions.pageSize
  }

  return {
    ...query,
    ...overrides,
  }
}

/**
 * Removes Directus primary key fields from a mutation body.
 */
export function stripPrimaryKeys<TItem extends Record<string, any>>(
  item: TItem,
  primaryKeys: string[] | undefined,
): TItem {
  const result = { ...item }
  for (const key of primaryKeys?.length ? primaryKeys : ['id']) {
    delete result[key]
  }
  return result
}

/**
 * Copies known Directus query options into the target query object.
 */
function assignDirectusQueryOptions(
  target: DirectusQueryOptions,
  source?: DirectusQueryOptions | DirectusFindOptions,
): void {
  if (!source) {
    return
  }

  for (const key of DIRECTUS_QUERY_KEYS) {
    const value = source[key]
    if (value !== undefined) {
      ;(target as any)[key] = value
    }
  }
}
