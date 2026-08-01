/**
 * Ids assigned to function-valued find option properties (`filter`, `sort`...),
 * keyed by function reference so the same function always receives the same id
 * within the current process.
 */
const functionIds = new WeakMap<(...args: any[]) => any, string>()

/**
 * Random per-process prefix ensuring function ids never collide across
 * processes (e.g. cache markers serialized on the server then hydrated on the
 * client), since function identity cannot be transferred between processes.
 */
const processId = Math.random().toString(36).slice(2)

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
    id = `${processId}-${++nextFunctionId}`
    functionIds.set(fn, id)
  }
  return id
}

/**
 * Serialize find options for dedupe keys and cache markers.
 *
 * Unlike plain `JSON.stringify`, function-valued properties (e.g. a `filter`
 * function) are not silently dropped: each function is replaced by a unique
 * per-process id, so two queries that differ only by their function options
 * never produce the same key, while repeated calls with the same function
 * reference do.
 */
export function stringifyFindOptions(findOptions: unknown): string {
  return JSON.stringify(findOptions, (_key, value) => typeof value === 'function' ? `$fn:${getFunctionId(value)}` : value)
}
