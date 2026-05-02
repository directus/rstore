/**
 * Result of a cache-side Directus filter evaluation.
 */
export type DirectusFilterEvaluation = {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Whether the item matches the filter.
   */
  matches: boolean
} | DirectusUnsupportedEvaluation

/**
 * Result of applying Directus query options to cache items.
 */
export type DirectusQueryEvaluation<TItem> = {
  /**
   * Whether the query can be evaluated safely in the local cache.
   */
  supported: true

  /**
   * Filtered, sorted, and paginated items.
   */
  items: TItem[]
} | DirectusUnsupportedEvaluation

/**
 * Unsupported local query/filter result.
 */
export interface DirectusUnsupportedEvaluation {
  /**
   * Whether the filter can be evaluated safely in the local cache.
   */
  supported: false

  /**
   * Human-readable reason for falling back to Directus.
   */
  reason: string
}

/**
 * Context used when evaluating Directus filters locally.
 */
export interface DirectusFilterContext {
  /**
   * rstore collection, used to detect relation filters.
   */
  collection?: {
    name: string
    relations?: Record<string, any>
  }

  /**
   * Current date used by `$NOW`; injectable for deterministic tests.
   */
  now?: Date
}

/**
 * Creates a supported filter result.
 */
export function supported(matches: boolean): DirectusFilterEvaluation {
  return {
    supported: true,
    matches,
  }
}

/**
 * Creates an unsupported filter or query result.
 */
export function unsupported(reason: string): DirectusUnsupportedEvaluation {
  return {
    supported: false,
    reason,
  }
}
