import type {
  FilterContext,
  FilterEvaluation,
  QueryEvaluation,
  UnsupportedEvaluation,
} from '@rstore/connector-toolkit'
import type { MonospaceCollectionLike } from '../runtime/collection'

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
export interface MonospaceFilterContext extends FilterContext {
  /**
   * rstore collection, used to detect relation filters and the 64-bit
   * integer fields (`meta.monospace.int64Fields`) compared numerically.
   */
  collection?: NonNullable<FilterContext['collection']> & Pick<MonospaceCollectionLike, 'meta'>
}

export { supported, unsupported } from '@rstore/connector-toolkit'
