import type { MarkExpandPolicy, TransformOptions } from './types.js'

/** Marks that extend over text typed inside a concurrently formatted range. */
const EXPANDING_MARKS = new Set(['bold', 'italic', 'code'])

/**
 * Default `expandOnConcurrentInsert` policy: `true` for `bold`, `italic` and
 * `code`; `false` for everything else (links, comment anchors, custom marks).
 */
export const defaultMarkExpandPolicy: MarkExpandPolicy = key => EXPANDING_MARKS.has(key)

/** Resolves the expand policy of transform options. */
export function resolveExpandPolicy(options: TransformOptions | undefined): MarkExpandPolicy {
  return options?.expand ?? defaultMarkExpandPolicy
}
