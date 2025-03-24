export function dedupePromise<TResult>(map: Map<string, Promise<TResult>>, key: string, fn: () => Promise<TResult>): Promise<TResult> {
  if (map.has(key)) {
    return map.get(key)!
  }

  const promise = fn()
  map.set(key, promise)

  promise.then(() => {
    map.delete(key)
  }).catch(() => {
    map.delete(key)
  })

  return promise
}
