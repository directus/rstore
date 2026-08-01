import type {
  FilterContext,
  FilterEvaluation,
  QueryEvaluation,
  UnsupportedEvaluation,
} from '@rstore/connector-toolkit'

/**
 * Result of a cache-side Monospace filter evaluation.
 */
export type MonospaceFilterEvaluation = FilterEvaluation

/**
 * Result of applying Monospace query options to cache items.
 */
export type MonospaceQueryEvaluation<TItem> = QueryEvaluation<TItem>

/**
 * Unsupported local query/filter result.
 */
export type MonospaceUnsupportedEvaluation = UnsupportedEvaluation

/**
 * Context used when evaluating Monospace filters locally.
 */
export type MonospaceFilterContext = FilterContext

export { supported, unsupported } from '@rstore/connector-toolkit'
