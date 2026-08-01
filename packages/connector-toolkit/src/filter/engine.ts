import type { FilterEngine, FilterEngineDialect } from './dialect'
import type { FilterContext, FilterEvaluation, QueryEvaluation } from './types'
import { evaluateOperator } from './operators'
import { paginateItems } from './paginate'
import { sortItems } from './sort'
import { supported, unsupported } from './types'

/**
 * Creates a cache-side filter engine for a connector dialect.
 */
export function createFilterEngine(dialect: FilterEngineDialect): FilterEngine {
  const readItemValue = dialect.readItemValue ?? ((item: Record<string, any>, key: string) => item[key])

  /**
   * Evaluates a connector filter against a single local cache item.
   */
  function evaluateFilter(
    item: Record<string, any>,
    filter: Record<string, any> | undefined,
    context: FilterContext = {},
  ): FilterEvaluation {
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
   * Applies cache-safe filter, sort, and pagination query options.
   */
  function applyQuery<TItem extends Record<string, any>>(
    items: TItem[],
    query: Record<string, any> | undefined,
    context: FilterContext = {},
  ): QueryEvaluation<TItem> {
    for (const check of dialect.unsupportedQueryChecks ?? []) {
      if (check.test(query)) {
        return unsupported(check.reason)
      }
    }

    let result = items
    if (query?.filter) {
      const filtered: TItem[] = []
      for (const item of items) {
        const evaluation = evaluateFilter(item, query.filter, context)
        if (!evaluation.supported) {
          return evaluation
        }
        if (evaluation.matches) {
          filtered.push(item)
        }
      }
      result = filtered
    }

    const sort = dialect.normalizeSort(query?.sort)
    if (!sort.supported) {
      return sort
    }

    return {
      supported: true,
      items: paginateItems(
        sortItems(result, sort.fields, { readValue: dialect.readItemValue }),
        query,
        dialect.paginate,
      ),
    }
  }

  /**
   * Evaluates a top-level field, function, or logical operator entry.
   */
  function evaluateFilterEntry(
    item: Record<string, any>,
    key: string,
    filterValue: any,
    context: FilterContext,
  ): FilterEvaluation {
    if (key === '_and') {
      return evaluateGroup(item, filterValue, context, 'and')
    }
    if (key === '_or') {
      return evaluateGroup(item, filterValue, context, 'or')
    }
    if (key === '_not' && dialect.supportsNotGroup) {
      return evaluateNotGroup(item, filterValue, context)
    }
    if (context.collection?.relations?.[key]) {
      return unsupported(`Relation filter "${key}" cannot be evaluated cache-side`)
    }
    if (Array.isArray(filterValue)) {
      return unsupported(`Invalid ${dialect.name} filter for "${key}"`)
    }
    if (!filterValue || typeof filterValue !== 'object') {
      // Equality shorthand: `filter[status]=published` means `_eq`.
      return dialect.equalityShorthand
        ? evaluateFieldOperator(item, key, '_eq', filterValue, context)
        : unsupported(`Invalid ${dialect.name} filter for "${key}"`)
    }

    for (const operator in filterValue) {
      const reason = dialect.unsupportedOperatorReason?.(operator)
      if (reason) {
        return unsupported(reason)
      }
      if (dialect.rejectNestedFieldKeys && !operator.startsWith('_')) {
        // Nested field conditions target related collections that the cache cannot join.
        return unsupported(`Relational filter "${key}.${operator}" cannot be evaluated cache-side`)
      }

      const matches = evaluateFieldOperator(item, key, operator, filterValue[operator], context)
      if (!matches.supported || !matches.matches) {
        return matches
      }
    }

    return supported(true)
  }

  /**
   * Resolves the filter value and evaluates one field operator.
   */
  function evaluateFieldOperator(
    item: Record<string, any>,
    key: string,
    operator: string,
    rawValue: any,
    context: FilterContext,
  ): FilterEvaluation {
    let value = rawValue
    if (dialect.resolveFilterValue) {
      const resolved = dialect.resolveFilterValue(rawValue, context)
      if (!resolved.supported) {
        return resolved
      }
      value = resolved.value
    }

    return evaluateOperator(readItemValue(item, key), operator, value, { extra: dialect.extraOperators })
  }

  /**
   * Evaluates an `_and` or `_or` filter group.
   */
  function evaluateGroup(
    item: Record<string, any>,
    filters: any,
    context: FilterContext,
    mode: 'and' | 'or',
  ): FilterEvaluation {
    if (!Array.isArray(filters)) {
      return unsupported(`${dialect.name} _${mode} expects an array`)
    }
    for (const filter of filters) {
      const result = evaluateFilter(item, filter, context)
      if (!result.supported) {
        return result
      }
      if (mode === 'and' && !result.matches) {
        return result
      }
      if (mode === 'or' && result.matches) {
        return supported(true)
      }
    }
    return supported(mode === 'and')
  }

  /**
   * Evaluates a `_not` filter group.
   */
  function evaluateNotGroup(
    item: Record<string, any>,
    filter: any,
    context: FilterContext,
  ): FilterEvaluation {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      return unsupported(`${dialect.name} _not expects a filter object`)
    }
    const result = evaluateFilter(item, filter, context)
    if (!result.supported) {
      return result
    }
    return supported(!result.matches)
  }

  return {
    evaluateFilter,
    applyQuery,
  }
}
