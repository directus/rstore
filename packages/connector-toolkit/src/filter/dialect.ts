import type { ExtraOperatorEvaluator } from './operators'
import type { PaginateOptions } from './paginate'
import type { NormalizedSort } from './sort'
import type { FilterContext, FilterEvaluation, QueryEvaluation, ResolvedFilterValue } from './types'

/**
 * Query shape check that forces a remote fetch when it matches.
 */
export interface UnsupportedQueryCheck {
  /**
   * Returns whether the query uses the unsupported feature.
   */
  test: (query: Record<string, any> | undefined) => boolean

  /**
   * Human-readable reason for falling back to the remote API.
   */
  reason: string
}

/**
 * Connector-specific behavior of a cache-side filter engine.
 */
export interface FilterEngineDialect {
  /**
   * Connector name used in unsupported-filter reasons (for example
   * `Directus` or `Monospace`).
   */
  name: string

  /**
   * Whether the connector supports the `_not` logical group.
   */
  supportsNotGroup?: boolean

  /**
   * Whether a primitive field value is shorthand for `_eq`
   * (`filter[status]=published`).
   */
  equalityShorthand?: boolean

  /**
   * Whether non-underscore keys inside a field filter are nested relational
   * conditions the cache cannot join.
   */
  rejectNestedFieldKeys?: boolean

  /**
   * Returns an unsupported reason for connector operators that can never be
   * evaluated cache-side (relation, geometry, quantifier operators...).
   */
  unsupportedOperatorReason?: (operator: string) => string | undefined

  /**
   * Reads the value of a filtered/sorted field from an item.
   *
   * Defaults to plain property access (`item[key]`).
   */
  readItemValue?: (item: Record<string, any>, key: string) => any

  /**
   * Resolves dynamic filter values (for example `$NOW`) before comparison.
   */
  resolveFilterValue?: (value: any, context: FilterContext) => ResolvedFilterValue

  /**
   * Connector-specific operators tried before the core operator switch.
   */
  extraOperators?: ExtraOperatorEvaluator

  /**
   * Query shape checks that force a remote fetch when they match.
   */
  unsupportedQueryChecks?: UnsupportedQueryCheck[]

  /**
   * Normalizes the connector sort specifier into ordered sort fields.
   */
  normalizeSort: (sort: unknown) => NormalizedSort

  /**
   * Pagination behavior applied by {@link FilterEngine.applyQuery}.
   */
  paginate?: PaginateOptions
}

/**
 * Cache-side filter engine created by `createFilterEngine`.
 */
export interface FilterEngine {
  /**
   * Evaluates a connector filter against a single local cache item.
   */
  evaluateFilter: (
    item: Record<string, any>,
    filter: Record<string, any> | undefined,
    context?: FilterContext,
  ) => FilterEvaluation

  /**
   * Applies cache-safe filter, sort, and pagination query options.
   */
  applyQuery: <TItem extends Record<string, any>>(
    items: TItem[],
    query: Record<string, any> | undefined,
    context?: FilterContext,
  ) => QueryEvaluation<TItem>
}
