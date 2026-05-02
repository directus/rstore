import type { DirectusFilterContext, DirectusFilterEvaluation, DirectusQueryEvaluation } from './filter-types'
import { evaluateOperator, paginateItems, sortItems } from './filter-operators'
import { supported, unsupported } from './filter-types'
import { readItemValue, resolveFilterValue } from './filter-values'

const GEOMETRY_OPERATORS = new Set([
  '_intersects',
  '_nintersects',
  '_intersects_bbox',
  '_nintersects_bbox',
])

const RELATION_OPERATORS = new Set(['_some', '_none'])

/**
 * Evaluates a Directus filter against a single local cache item.
 */
export function evaluateDirectusFilter(
  item: Record<string, any>,
  filter: Record<string, any> | undefined,
  context: DirectusFilterContext = {},
): DirectusFilterEvaluation {
  if (!filter || !Object.keys(filter).length) {
    return supported(true)
  }

  for (const key in filter) {
    const value = filter[key]
    const result = evaluateFilterEntry(item, key, value, context)
    if (!result.supported || !result.matches) {
      return result
    }
  }

  return supported(true)
}

/**
 * Applies Directus cache-safe filter, sort, and pagination options.
 */
export function applyDirectusQuery<TItem extends Record<string, any>>(
  items: TItem[],
  query: Record<string, any> | undefined,
  context: DirectusFilterContext = {},
): DirectusQueryEvaluation<TItem> {
  if (query?.search) {
    return unsupported('Directus search cannot be evaluated cache-side')
  }
  if (query?.deep || query?.alias || query?.version || query?.versionRaw) {
    return unsupported('Nested, aliased, or versioned Directus queries require a fetch')
  }

  let result = items
  if (query?.filter) {
    const filtered: TItem[] = []
    for (const item of items) {
      const evaluation = evaluateDirectusFilter(item, query.filter, context)
      if (!evaluation.supported) {
        return evaluation
      }
      if (evaluation.matches) {
        filtered.push(item)
      }
    }
    result = filtered
  }

  return {
    supported: true,
    items: paginateItems(sortItems(result, query?.sort), query),
  }
}

/**
 * Backward-compatible boolean filter used by older imports.
 */
export function filterItem(
  _store: any,
  collection: DirectusFilterContext['collection'],
  item: Record<string, any>,
  filter: Record<string, any>,
): boolean {
  const result = evaluateDirectusFilter(item, filter, { collection })
  return result.supported && result.matches
}

/**
 * Evaluates a top-level field, function, or logical operator entry.
 */
function evaluateFilterEntry(
  item: Record<string, any>,
  key: string,
  filterValue: any,
  context: DirectusFilterContext,
): DirectusFilterEvaluation {
  if (key === '_and') {
    return evaluateAndGroup(item, filterValue, context)
  }
  if (key === '_or') {
    return evaluateOrGroup(item, filterValue, context)
  }
  if (context.collection?.relations?.[key]) {
    return unsupported(`Relation filter "${key}" cannot be evaluated cache-side`)
  }
  if (!filterValue || typeof filterValue !== 'object' || Array.isArray(filterValue)) {
    return unsupported(`Invalid Directus filter for "${key}"`)
  }

  for (const operator in filterValue) {
    if (RELATION_OPERATORS.has(operator)) {
      return unsupported(`Relation operator "${operator}" cannot be evaluated cache-side`)
    }
    if (GEOMETRY_OPERATORS.has(operator)) {
      return unsupported(`Geometry operator "${operator}" cannot be evaluated cache-side`)
    }

    const value = resolveFilterValue(filterValue[operator], context)
    if (!value.supported) {
      return value
    }

    const matches = evaluateOperator(readItemValue(item, key), operator, value.value)
    if (!matches.supported || !matches.matches) {
      return matches
    }
  }

  return supported(true)
}

/**
 * Evaluates an `_and` filter group.
 */
function evaluateAndGroup(
  item: Record<string, any>,
  filters: any,
  context: DirectusFilterContext,
): DirectusFilterEvaluation {
  if (!Array.isArray(filters)) {
    return unsupported('Directus _and expects an array')
  }
  for (const filter of filters) {
    const result = evaluateDirectusFilter(item, filter, context)
    if (!result.supported || !result.matches) {
      return result
    }
  }
  return supported(true)
}

/**
 * Evaluates an `_or` filter group.
 */
function evaluateOrGroup(
  item: Record<string, any>,
  filters: any,
  context: DirectusFilterContext,
): DirectusFilterEvaluation {
  if (!Array.isArray(filters)) {
    return unsupported('Directus _or expects an array')
  }
  for (const filter of filters) {
    const result = evaluateDirectusFilter(item, filter, context)
    if (!result.supported) {
      return result
    }
    if (result.matches) {
      return supported(true)
    }
  }
  return supported(false)
}
