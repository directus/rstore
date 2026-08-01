// @ts-expect-error virtual file
import { queryLimits } from '$rstore-drizzle-server-utils.js'

/**
 * Bounds enforced on client-supplied queries. Each bound can be `false` to
 * disable it (not recommended — these are the only protection against
 * full-table dumps and unbounded fan-out from unauthenticated clients).
 */
export interface RstoreDrizzleQueryLimits {
  /** Default `limit` when the client sends none, and clamp when it sends more. */
  maxLimit: number | false
  /** Maximum number of `keys` accepted by a fetchMany request. */
  maxKeys: number | false
  /** Maximum nesting depth of the `include` tree. */
  maxIncludeDepth: number | false
  /** Maximum number of operations accepted by one `_batch` request. */
  maxBatchSize: number | false
}

/** Defaults applied when the module options don't override a bound. */
export const DEFAULT_QUERY_LIMITS: RstoreDrizzleQueryLimits = {
  maxLimit: 1000,
  maxKeys: 1000,
  maxIncludeDepth: 5,
  maxBatchSize: 100,
}

/**
 * Resolves the effective query bounds: module options (codegen'd into the
 * server template) merged over {@link DEFAULT_QUERY_LIMITS}.
 */
export function getQueryLimits(): RstoreDrizzleQueryLimits {
  return {
    ...DEFAULT_QUERY_LIMITS,
    ...(queryLimits ?? {}),
  }
}
