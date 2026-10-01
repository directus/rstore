import type { MonospaceInclude, MonospaceIncludeContext } from './include'
import type { MonospaceSortInput } from './sort'
import { createConnectorQuery, isRecord } from '@rstore/connector-toolkit'
import { collectIncludeBackingFields, createMonospaceInclude, withBackingFields } from './include'
import { normalizeMonospaceSort } from './sort'

export { stripPrimaryKeys } from '@rstore/connector-toolkit'

/**
 * Monospace REST query options supported by the rstore adapter.
 */
export interface MonospaceQueryOptions {
  /**
   * Primitive fields selected on the items, `*` for all of them. Aliases use
   * the `responseName:sourceField` form. Reads default to `['*']`.
   */
  fields?: string[]

  /**
   * Monospace filter object.
   */
  filter?: Record<string, any>

  /**
   * Sort specifiers. The Monospace object form is
   * `[{ field: { direction: 'desc' } }]`; field names (`'-field'` for
   * descending) and `{ field: 'desc' }` are normalized to it.
   */
  sort?: MonospaceSortInput | MonospaceSortInput[]

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
   * Adapter-specific params forwarded to Monospace. A raw Monospace
   * `include` object passed here is merged into the include generated from
   * the rstore `include` option.
   */
  params?: MonospaceQueryOptions & {
    /**
     * Raw Monospace include options keyed by relation name.
     */
    include?: MonospaceInclude
  }
}

// rstore consumes its own top-level `include` option, so `include` is not a
// known key: a raw Monospace include is only read from `params`.
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
  return createConnectorQuery<MonospaceQueryOptions>(findOptions, overrides, {
    knownKeys: MONOSPACE_QUERY_KEYS,
    // Monospace `params` accept arbitrary custom REST query keys.
    mergeParams: true,
  })
}

/**
 * Creates the Monospace REST query of a read request.
 *
 * Monospace 1.0 rejects reads without a field selection, so `fields`
 * defaults to `['*']`. The rstore `include` option maps to a Monospace
 * `include` object (see {@link createMonospaceInclude}), and explicit
 * `fields` get the parent-side FK columns backing the included relations so
 * the rstore cache can resolve the relation joins.
 */
export function createMonospaceReadQuery(
  findOptions: MonospaceFindOptions | undefined,
  context: MonospaceIncludeContext = {},
  overrides: MonospaceQueryOptions = {},
): MonospaceQueryOptions {
  const query = createMonospaceQuery(findOptions, overrides)
  const include = createMonospaceInclude(findOptions?.include, context, query.include)
  query.fields = withBackingFields(query.fields, collectIncludeBackingFields(include, context.collection))
  if (include) {
    query.include = include
  }
  else {
    delete query.include
  }
  return query
}

/**
 * Serializes Monospace query options into URL search parameters.
 *
 * Sort specifiers are normalized to the Monospace object form, field
 * selections are comma-joined at every include level, and other nested
 * values use bracket notation.
 */
export function serializeMonospaceQuery(query?: MonospaceQueryOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (query) {
    appendSelection(params, '', query)
  }
  return params
}

/**
 * Appends the options of one selection level (top-level query or include
 * entry) under a bracket prefix.
 */
function appendSelection(params: URLSearchParams, prefix: string, options: Record<string, any>): void {
  for (const [key, value] of Object.entries(options)) {
    const name = prefix ? `${prefix}[${key}]` : key
    if (key === 'fields' && Array.isArray(value)) {
      params.set(name, value.join(','))
    }
    else if (key === 'sort') {
      appendQueryValue(params, name, normalizeMonospaceSort(value))
    }
    else if (key === 'include' && isRecord(value)) {
      for (const [relation, relationOptions] of Object.entries(value)) {
        if (isRecord(relationOptions)) {
          appendSelection(params, `${name}[${relation}]`, relationOptions)
        }
      }
    }
    else {
      appendQueryValue(params, name, value)
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
