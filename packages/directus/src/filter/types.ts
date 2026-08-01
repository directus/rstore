import type {
  FilterContext,
  FilterEvaluation,
  QueryEvaluation,
  UnsupportedEvaluation,
} from '@rstore/connector-toolkit'

/**
 * Result of a cache-side Directus filter evaluation.
 */
export type DirectusFilterEvaluation = FilterEvaluation

/**
 * Result of applying Directus query options to cache items.
 */
export type DirectusQueryEvaluation<TItem> = QueryEvaluation<TItem>

/**
 * Unsupported local query/filter result.
 */
export type DirectusUnsupportedEvaluation = UnsupportedEvaluation

/**
 * Context used when evaluating Directus filters locally.
 */
export type DirectusFilterContext = FilterContext

export { supported, unsupported } from '@rstore/connector-toolkit'
