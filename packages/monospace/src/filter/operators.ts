import type { NormalizedSort } from '@rstore/connector-toolkit'
import {
  normalizeSort as toolkitNormalizeSort,
  paginateItems as toolkitPaginateItems,
} from '@rstore/connector-toolkit'

export type { NormalizedSort, NormalizedSortField } from '@rstore/connector-toolkit'
export { comparableValue, evaluateOperator, sortItems } from '@rstore/connector-toolkit'

/**
 * Normalizes Monospace sort specifiers into ordered sort fields.
 */
export function normalizeSort(sort: unknown): NormalizedSort {
  return toolkitNormalizeSort(sort, { dialectName: 'Monospace' })
}

/**
 * Applies Monospace limit and offset options to an item list.
 *
 * Monospace treats `limit` values of `0` and `-1` as unlimited.
 */
export function paginateItems<TItem>(items: TItem[], query: Record<string, any> | undefined): TItem[] {
  return toolkitPaginateItems(items, query, { unlimitedSentinels: true })
}
