/** Accepted publications share ownership across pushes, fetches and reactive observers. */
const owners = new WeakMap<object, object>()

/** Begin one publication; any nested accepted publication supersedes all remaining work. */
export function beginPagePublication(page: object, isCurrent: () => boolean): () => boolean {
  const owner = {}
  owners.set(page, owner)
  return () => owners.get(page) === owner && isCurrent()
}
