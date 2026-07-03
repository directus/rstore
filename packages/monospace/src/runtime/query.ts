/**
 * Monospace REST query options supported by the rstore adapter.
 */
export interface MonospaceQueryOptions {
  /**
   * Field selection sent to Monospace.
   */
  fields?: string[]

  /**
   * Monospace filter object.
   */
  filter?: Record<string, any>

  /**
   * Monospace sort specifier.
   */
  sort?: Array<string | Record<string, any>>

  /**
   * Maximum number of items to return.
   */
  limit?: number

  /**
   * Number of items to skip.
   */
  offset?: number

  /**
   * Additional Monospace REST query parameters.
   */
  [key: string]: any
}

/**
 * rstore find options with Monospace-specific top-level query options.
 */
export interface MonospaceFindOptions extends MonospaceQueryOptions {
  /**
   * rstore page index used by paginated queries.
   */
  pageIndex?: number

  /**
   * rstore page size used by paginated queries.
   */
  pageSize?: number

  /**
   * Adapter-specific params forwarded to Monospace.
   */
  params?: MonospaceQueryOptions
}

const MONOSPACE_QUERY_KEYS = [
  'fields',
  'filter',
  'sort',
  'limit',
  'offset',
] as const

/**
 * Creates a Monospace REST query from rstore find options.
 */
export function createMonospaceQuery(
  findOptions?: MonospaceFindOptions,
  overrides: MonospaceQueryOptions = {},
): MonospaceQueryOptions {
  const query: MonospaceQueryOptions = {}

  assignQueryOptions(query, findOptions?.params, false)
  assignQueryOptions(query, findOptions, true)

  if (
    findOptions?.pageIndex != null
    && findOptions.pageSize != null
    && query.limit == null
    && query.offset == null
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
 * Serializes Monospace query options into URL search parameters.
 */
export function serializeMonospaceQuery(query?: MonospaceQueryOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (!query) {
    return params
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue
    }
    if (key === 'fields' && Array.isArray(value)) {
      params.set(key, value.join(','))
      continue
    }
    appendQueryValue(params, key, value)
  }

  return params
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
 * Copies known and custom Monospace query options into the target object.
 */
function assignQueryOptions(
  target: MonospaceQueryOptions,
  source: MonospaceQueryOptions | MonospaceFindOptions | undefined,
  knownOnly: boolean,
): void {
  if (!source) {
    return
  }

  if (!knownOnly) {
    Object.assign(target, source)
    return
  }

  for (const key of MONOSPACE_QUERY_KEYS) {
    const value = source[key]
    if (value !== undefined) {
      ;(target as Record<string, any>)[key] = value
    }
  }
}

/**
 * Appends a nested value as bracket-notation URL query parameters.
 */
function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value == null) {
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendQueryValue(params, `${key}[${index}]`, item))
    return
  }
  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendQueryValue(params, `${key}[${childKey}]`, childValue)
    }
    return
  }
  params.set(key, String(value))
}
