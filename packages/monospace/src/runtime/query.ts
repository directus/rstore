import type { MonospaceRelationCollectionLike } from './relations'

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
  'deep',
  'alias',
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

  // rstore function filters are cache-side predicates that cannot be sent to Monospace.
  if (typeof query.filter === 'function') {
    delete query.filter
  }

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
 * Builds Monospace nested field selections for an rstore `include` option.
 *
 * Each included relation maps to a `relation.*` wildcard selection and
 * nested includes recurse with dot notation (`relation.nested.*`), matching
 * the Monospace relational data API.
 */
export function createMonospaceIncludeFields(include: Record<string, any> | undefined): string[] {
  const fields: string[] = []
  appendIncludeFields(fields, include, '')
  return fields
}

/**
 * Adds include-driven nested field selections to a Monospace query.
 *
 * A `*` base selection is added when the query selects no explicit fields so
 * embedded relations do not narrow the returned item columns. When the query
 * selects explicit fields, the FK columns backing each included relation on
 * the parent side are appended so the rstore cache can resolve the relation
 * joins (`*` selections already include all primitive columns). The nested
 * relation selections use wildcards, so the target-side join columns are
 * always included.
 */
export function applyMonospaceIncludeFields<TQuery extends MonospaceQueryOptions>(
  query: TQuery,
  include: Record<string, any> | undefined,
  collection?: MonospaceRelationCollectionLike,
): TQuery {
  const selections = createMonospaceIncludeFields(include)
  if (!selections.length) {
    return query
  }

  const baseFields = typeof query.fields === 'string' ? (query.fields as string).split(',') : query.fields
  const base = baseFields?.length ? baseFields : ['*']
  const backingFields = base.includes('*') ? [] : collectIncludeBackingFields(include, collection)
  query.fields = [...new Set([...base, ...backingFields, ...selections])]
  return query
}

/**
 * Collects the source-side FK columns backing the included relations.
 */
function collectIncludeBackingFields(
  include: Record<string, any> | undefined,
  collection: MonospaceRelationCollectionLike | undefined,
): string[] {
  const fields: string[] = []
  for (const key in include) {
    if (!include[key]) {
      continue
    }
    const relation = collection?.normalizedRelations?.[key]
    for (const target of relation?.to ?? []) {
      fields.push(...Object.values(target.on))
    }
  }
  return fields
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
 * Appends include field selections for one nesting level.
 */
function appendIncludeFields(
  fields: string[],
  include: Record<string, any> | undefined,
  prefix: string,
): void {
  for (const key in include) {
    const value = include[key]
    if (!value) {
      continue
    }
    fields.push(`${prefix}${key}.*`)
    if (value && typeof value === 'object' && value.include && typeof value.include === 'object') {
      appendIncludeFields(fields, value.include, `${prefix}${key}.`)
    }
  }
}

/**
 * Appends a nested value as bracket-notation URL query parameters.
 */
function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value == null || typeof value === 'function') {
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
