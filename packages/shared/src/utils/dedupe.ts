/**
 * @deprecated Internal callers use query-specific dedupe ownership now. This
 * public helper remains available for compatibility.
 */
export function dedupePromise<TResult>(map: Map<string, Promise<TResult>>, key: string, fn: () => Promise<TResult>): Promise<TResult> {
  if (map.has(key)) {
    return map.get(key)!
  }

  const promise = fn()
  map.set(key, promise)

  promise.then(() => {
    map.delete(key)
  }, () => {
    map.delete(key)
  })

  return promise
}
