/**
 * Result of a cache-side Monospace filter evaluation.
 */
export type MonospaceFilterEvaluation = {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Whether the item matches the filter.
   */
  matches: boolean
} | MonospaceUnsupportedEvaluation

/**
 * Result of applying Monospace query options to cache items.
 */
export type MonospaceQueryEvaluation<TItem> = {
  /**
   * Whether the query can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Filtered, sorted, and paginated items.
   */
  items: TItem[]
} | MonospaceUnsupportedEvaluation

/**
 * Unsupported local query/filter result.
 */
export interface MonospaceUnsupportedEvaluation {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: false

  /**
   * Human-readable reason for falling back to Monospace.
   */
  reason: string
}

/**
 * Context used when evaluating Monospace filters locally.
 */
export interface MonospaceFilterContext {
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
}

/**
 * Creates a supported filter result.
 */
export function supported(matches: boolean): MonospaceFilterEvaluation {
  return {
    supported: true,
    matches,
  }
}

/**
 * Creates an unsupported filter or query result.
 */
export function unsupported(reason: string): MonospaceUnsupportedEvaluation {
  return {
    supported: false,
    reason,
  }
}
