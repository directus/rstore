/**
 * Ids assigned to function-valued find option properties (`filter`, `sort`...),
 * keyed by function reference so the same function always receives the same id
 * within the current process.
 */
const functionIds = new WeakMap<(...args: any[]) => any, string>()

/**
 * Counter used to generate unique function ids.
 */
let nextFunctionId = 0

/**
 * Return a stable (per-process) unique id for a function.
 */
function getFunctionId(fn: (...args: any[]) => any): string {
  let id = functionIds.get(fn)
  if (id == null) {
    id = String(++nextFunctionId)
    functionIds.set(fn, id)
  }
  return id
}

export interface StringifyFindOptionsOptions {
  /**
   * Omit function-valued properties instead of serializing them to a
   * per-process id.
   *
   * Required for cache markers: markers are serialized into the SSR payload
   * and recomputed on the client, and no function id can survive that
   * boundary — reference identity is process-local, and even source-based
   * hashes diverge because server and client bundles transform the same
   * code differently (minification, ref unwrapping). Omission is safe for
   * markers because function options only filter the cache client-side —
   * what a fetch returns is driven by the serializable options, which stay
   * in the marker.
   */
  omitFunctions?: boolean
}

/**
 * Serialize find options for dedupe keys and cache markers.
 *
 * Unlike plain `JSON.stringify`, function-valued properties (e.g. a `filter`
 * function) are not silently dropped by default: each function is replaced
 * by a unique per-process id, so two queries that differ only by their
 * function options never share a key, while repeated calls with the same
 * function reference do. Pass `omitFunctions: true` for keys that must be
 * stable across processes (see {@link StringifyFindOptionsOptions}).
 */
export function stringifyFindOptions(findOptions: unknown, options?: StringifyFindOptionsOptions): string {
  const omitFunctions = options?.omitFunctions ?? false
  return JSON.stringify(findOptions, (_key, value) => {
    if (typeof value === 'function') {
      return omitFunctions ? undefined : `$fn:${getFunctionId(value)}`
    }
    return value
  })
}
