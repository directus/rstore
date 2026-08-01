import type { DirectusFilterContext, DirectusFilterEvaluation, DirectusQueryEvaluation } from './types'
import { createFilterEngine, normalizeSortStrings } from '@rstore/connector-toolkit'
import { directusExtraOperators } from './operators'
import { readItemValue, resolveFilterValue } from './values'

const GEOMETRY_OPERATORS = new Set([
  '_intersects',
  '_nintersects',
  '_intersects_bbox',
  '_nintersects_bbox',
])

const RELATION_OPERATORS = new Set(['_some', '_none'])

/**
 * Cache-side filter engine configured with the Directus dialect: dynamic
 * `$NOW` variables, function-parameter fields, the Directus extra operators,
 * string sort specifiers, and 1-based `page` pagination.
 */
const engine = createFilterEngine({
  name: 'Directus',
  unsupportedOperatorReason: (operator) => {
    if (RELATION_OPERATORS.has(operator)) {
      return `Relation operator "${operator}" cannot be evaluated cache-side`
    }
    if (GEOMETRY_OPERATORS.has(operator)) {
      return `Geometry operator "${operator}" cannot be evaluated cache-side`
    }
    return undefined
  },
  readItemValue,
  resolveFilterValue,
  extraOperators: directusExtraOperators,
  unsupportedQueryChecks: [
    {
      test: query => Boolean(query?.search),
      reason: 'Directus search cannot be evaluated cache-side',
    },
    {
      test: query => Boolean(query?.deep || query?.alias || query?.version || query?.versionRaw),
      reason: 'Nested, aliased, or versioned Directus queries require a fetch',
    },
  ],
  // Directus sorts with `-field` string specifiers, which always normalize.
  normalizeSort: sort => ({
    supported: true,
    fields: normalizeSortStrings(sort as string | string[] | undefined),
  }),
  paginate: { supportsPage: true },
})

/**
 * Evaluates a Directus filter against a single local cache item.
 */
export function evaluateDirectusFilter(
  item: Record<string, any>,
  filter: Record<string, any> | undefined,
  context: DirectusFilterContext = {},
): DirectusFilterEvaluation {
  return engine.evaluateFilter(item, filter, context)
}

/**
 * Applies Directus cache-safe filter, sort, and pagination options.
 */
export function applyDirectusQuery<TItem extends Record<string, any>>(
  items: TItem[],
  query: Record<string, any> | undefined,
  context: DirectusFilterContext = {},
): DirectusQueryEvaluation<TItem> {
  return engine.applyQuery(items, query, context)
}
