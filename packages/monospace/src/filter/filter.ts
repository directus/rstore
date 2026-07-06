import type { MonospaceFilterContext, MonospaceFilterEvaluation, MonospaceQueryEvaluation } from './types'
import { evaluateOperator, normalizeSort, paginateItems, sortItems } from './operators'
import { supported, unsupported } from './types'

const QUANTIFIER_OPERATORS = new Set(['_some', '_every', '_none'])

/**
 * Evaluates a Monospace filter against a single local cache item.
 */
export function evaluateMonospaceFilter(
  item: Record<string, any>,
  filter: Record<string, any> | undefined,
  context: MonospaceFilterContext = {},
): MonospaceFilterEvaluation {
  if (!filter || !Object.keys(filter).length) {
    return supported(true)
  }

  for (const key in filter) {
    const result = evaluateFilterEntry(item, key, filter[key], context)
    if (!result.supported || !result.matches) {
      return result
    }
  }

  return supported(true)
}

/**
 * Applies Monospace cache-safe filter, sort, and pagination options.
 *
 * Aggregation options are ignored because the Monospace API also silently
 * ignores them on item read endpoints.
 */
export function applyMonospaceQuery<TItem extends Record<string, any>>(
  items: TItem[],
  query: Record<string, any> | undefined,
  context: MonospaceFilterContext = {},
): MonospaceQueryEvaluation<TItem> {
  if (query?.deep || query?.alias) {
    return unsupported('Nested or aliased Monospace queries require a fetch')
  }

  let result = items
  if (query?.filter) {
    const filtered: TItem[] = []
    for (const item of items) {
      const evaluation = evaluateMonospaceFilter(item, query.filter, context)
      if (!evaluation.supported) {
        return evaluation
      }
      if (evaluation.matches) {
        filtered.push(item)
      }
    }
    result = filtered
  }

  const sort = normalizeSort(query?.sort)
  if (!sort.supported) {
    return sort
  }

  return {
    supported: true,
    items: paginateItems(sortItems(result, sort.fields), query),
  }
}

/**
 * Evaluates a top-level field or logical operator entry.
 */
function evaluateFilterEntry(
  item: Record<string, any>,
  key: string,
  filterValue: any,
  context: MonospaceFilterContext,
): MonospaceFilterEvaluation {
  if (key === '_and') {
    return evaluateAndGroup(item, filterValue, context)
  }
  if (key === '_or') {
    return evaluateOrGroup(item, filterValue, context)
  }
  if (key === '_not') {
    return evaluateNotGroup(item, filterValue, context)
  }
  if (context.collection?.relations?.[key]) {
    return unsupported(`Relation filter "${key}" cannot be evaluated cache-side`)
  }
  if (Array.isArray(filterValue)) {
    return unsupported(`Invalid Monospace filter for "${key}"`)
  }
  if (!filterValue || typeof filterValue !== 'object') {
    // Monospace equality shorthand: `filter[status]=published` means `_eq`.
    return evaluateOperator(item[key], '_eq', filterValue)
  }

  for (const operator in filterValue) {
    if (QUANTIFIER_OPERATORS.has(operator)) {
      return unsupported(`Relation quantifier "${operator}" cannot be evaluated cache-side`)
    }
    if (!operator.startsWith('_')) {
      // Nested field conditions target related collections that the cache cannot join.
      return unsupported(`Relational filter "${key}.${operator}" cannot be evaluated cache-side`)
    }

    const matches = evaluateOperator(item[key], operator, filterValue[operator])
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
  context: MonospaceFilterContext,
): MonospaceFilterEvaluation {
  if (!Array.isArray(filters)) {
    return unsupported('Monospace _and expects an array')
  }
  for (const filter of filters) {
    const result = evaluateMonospaceFilter(item, filter, context)
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
  context: MonospaceFilterContext,
): MonospaceFilterEvaluation {
  if (!Array.isArray(filters)) {
    return unsupported('Monospace _or expects an array')
  }
  for (const filter of filters) {
    const result = evaluateMonospaceFilter(item, filter, context)
    if (!result.supported) {
      return result
    }
    if (result.matches) {
      return supported(true)
    }
  }
  return supported(false)
}

/**
 * Evaluates a `_not` filter group.
 */
function evaluateNotGroup(
  item: Record<string, any>,
  filter: any,
  context: MonospaceFilterContext,
): MonospaceFilterEvaluation {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return unsupported('Monospace _not expects a filter object')
  }
  const result = evaluateMonospaceFilter(item, filter, context)
  if (!result.supported) {
    return result
  }
  return supported(!result.matches)
}
