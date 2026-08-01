import type { MonospaceFilterContext, MonospaceFilterEvaluation, MonospaceQueryEvaluation } from './types'
import { createFilterEngine } from '@rstore/connector-toolkit'
import { normalizeSort } from './operators'

const QUANTIFIER_OPERATORS = new Set(['_some', '_every', '_none'])

/**
 * Cache-side filter engine configured with the Monospace dialect: `_not`
 * groups, the equality shorthand, nested relational field rejection, and the
 * unlimited `limit: 0 / -1` sentinels.
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
    test: query => Boolean(query?.deep || query?.alias),
    reason: 'Nested or aliased Monospace queries require a fetch',
  }],
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
