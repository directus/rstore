import type { MonospaceFilterContext, MonospaceFilterEvaluation, MonospaceQueryEvaluation } from './types'
import { createFilterEngine, isRecord } from '@rstore/connector-toolkit'
import { normalizeMonospaceFieldValue } from './int64'
import { normalizeSort } from './operators'

const QUANTIFIER_OPERATORS = new Set(['_some', '_every', '_none'])

/**
 * Cache-side filter engine configured with the Monospace dialect: `_not`
 * groups, the equality shorthand, nested relational field rejection,
 * numeric 64-bit integer fields, and the unlimited `limit: 0 / -1` sentinels.
 */
const engine = createFilterEngine({
  name: 'Monospace',
  supportsNotGroup: true,
  equalityShorthand: true,
  rejectNestedFieldKeys: true,
  unsupportedOperatorReason: operator => QUANTIFIER_OPERATORS.has(operator)
    ? `Relation quantifier "${operator}" cannot be evaluated cache-side`
    : undefined,
  unsupportedQueryChecks: [{
    test: query => hasAliasedFields(query?.fields),
    reason: 'Aliased Monospace fields require a fetch',
  }, {
    test: query => isNarrowedInclude(query?.include),
    reason: 'Aliased, filtered, or paginated Monospace includes require a fetch',
  }],
  normalizeFieldValue: normalizeMonospaceFieldValue,
  normalizeSort,
  paginate: { unlimitedSentinels: true },
})

/**
 * Evaluates a Monospace filter against a single local cache item.
 */
export function evaluateMonospaceFilter(
  item: Record<string, any>,
  filter: Record<string, any> | undefined,
  context: MonospaceFilterContext = {},
): MonospaceFilterEvaluation {
  return engine.evaluateFilter(item, filter, context)
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
  return engine.applyQuery(items, query, context)
}

/**
 * Returns whether a field selection renames fields (`responseName:sourceField`).
 */
function hasAliasedFields(fields: unknown): boolean {
  const list = typeof fields === 'string' ? fields.split(',') : fields
  return Array.isArray(list) && list.some(field => typeof field === 'string' && field.includes(':'))
}

/**
 * Returns whether a raw Monospace include changes which related items or
 * field names are embedded: aliases, `filter`, a finite `limit`, or an
 * `offset`. Cached relation joins cannot reproduce those subsets, so such
 * queries always fetch. Include `sort` only orders the embedded lists and
 * an unlimited `limit` (`0`/`-1`) returns every related item.
 */
function isNarrowedInclude(include: unknown): boolean {
  if (!isRecord(include)) {
    return false
  }
  return Object.entries(include).some(([key, options]) => {
    if (key.includes(':')) {
      return true
    }
    if (!isRecord(options)) {
      return false
    }
    return hasAliasedFields(options.fields)
      || options.filter != null
      || (options.limit != null && options.limit !== 0 && options.limit !== -1)
      || Boolean(options.offset)
      || isNarrowedInclude(options.include)
  })
}
