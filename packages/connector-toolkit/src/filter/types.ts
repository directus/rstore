/**
 * Result of a cache-side filter evaluation.
 */
export type FilterEvaluation = {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Whether the item matches the filter.
   */
  matches: boolean
} | UnsupportedEvaluation

/**
 * Result of applying connector query options to cache items.
 */
export type QueryEvaluation<TItem> = {
  /**
   * Whether the query can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Filtered, sorted, and paginated items.
   */
  items: TItem[]
} | UnsupportedEvaluation

/**
 * Unsupported local query/filter result.
 */
export interface UnsupportedEvaluation {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: false

  /**
   * Human-readable reason for falling back to the remote API.
   */
  reason: string
}

/**
 * Filter value resolved into a static, cache-comparable value.
 */
export type ResolvedFilterValue = {
  /**
   * Whether the value was resolved successfully.
   */
  supported: true

  /**
   * Static value to use in operator comparison.
   */
  value: any
} | UnsupportedEvaluation

/**
 * Context used when evaluating connector filters locally.
 */
export interface FilterContext {
  /**
   * rstore collection, used to detect relation filters.
   */
  collection?: {
    /**
     * rstore collection name.
     */
    name: string

    /**
     * rstore relations keyed by relation field.
     */
    relations?: Record<string, any>
  }

  /**
   * Current date used by dynamic date variables; injectable for
   * deterministic tests.
   */
  now?: Date
}

/**
 * Creates a supported filter result.
 */
export function supported(matches: boolean): FilterEvaluation {
  return {
    supported: true,
    matches,
  }
}

/**
 * Creates an unsupported filter or query result.
 */
export function unsupported(reason: string): UnsupportedEvaluation {
  return {
    supported: false,
    reason,
  }
}
