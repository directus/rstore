/**
 * rstore find options shape consumed by {@link createConnectorQuery}.
 */
export interface ConnectorFindOptions extends Record<string, any> {
  /**
   * rstore page index used by paginated queries.
   */
  pageIndex?: number

  /**
   * rstore page size used by paginated queries.
   */
  pageSize?: number

  /**
   * Adapter-specific params forwarded to the connector.
   */
  params?: Record<string, any>
}

/**
 * Options accepted by {@link createConnectorQuery}.
 */
export interface CreateConnectorQueryOptions {
  /**
   * Connector query keys copied from find options and params.
   */
  knownKeys: readonly string[]

  /**
   * Assign `params` wholesale (custom keys included) instead of copying
   * known keys only.
   */
  mergeParams?: boolean

  /**
   * Skip the pageIndex/pageSize mapping when the query has an explicit
   * `page` option.
   */
  respectPageOption?: boolean
}

/**
 * Creates a connector REST query from rstore find options.
 *
 * Copies params first, then known top-level find options, maps rstore
 * `pageIndex`/`pageSize` to `limit`/`offset` when no explicit pagination is
 * set, and applies overrides last.
 */
export function createConnectorQuery<TQuery extends Record<string, any>>(
  findOptions: ConnectorFindOptions | undefined,
  overrides: Record<string, any>,
  options: CreateConnectorQueryOptions,
): TQuery {
  const query: Record<string, any> = {}

  assignQueryOptions(query, findOptions?.params, options)
  assignQueryOptions(query, findOptions, { ...options, mergeParams: false })

  // rstore function filters are cache-side predicates that cannot be sent to the API.
  if (typeof query.filter === 'function') {
    delete query.filter
  }

  if (
    findOptions?.pageIndex != null
    && findOptions.pageSize != null
    && query.limit == null
    && query.offset == null
    && (!options.respectPageOption || query.page == null)
  ) {
    query.limit = findOptions.pageSize
    query.offset = findOptions.pageIndex * findOptions.pageSize
  }

  return {
    ...query,
    ...overrides,
  } as TQuery
}

/**
 * Removes generated primary key fields from a mutation body.
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
 * Copies known (or, when merging params, all) query options into the target.
 */
function assignQueryOptions(
  target: Record<string, any>,
  source: Record<string, any> | undefined,
  options: CreateConnectorQueryOptions,
): void {
  if (!source) {
    return
  }

  if (options.mergeParams) {
    Object.assign(target, source)
    return
  }

  for (const key of options.knownKeys) {
    const value = source[key]
    if (value !== undefined) {
      target[key] = value
    }
  }
}
