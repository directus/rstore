import { createError } from 'h3'

/**
 * Collections exposed to clients. `null` means no allow-list was configured
 * (every collection is exposed — the default).
 */
let allowedCollections: Set<string> | null = null

/**
 * Adds collections to the allow-list, creating it on first call. Once an
 * allow-list exists, every client-reachable path (REST routes, `_batch`
 * operations, relation `include`s and realtime subscriptions) rejects
 * collections that are not on it.
 *
 * @param collectionNames Collection names to allow.
 */
export function registerAllowedCollections(collectionNames: string[]) {
  allowedCollections ??= new Set()
  for (const name of collectionNames) {
    allowedCollections.add(name)
  }
}

/**
 * Whether a collection may be accessed by clients. Always `true` when no
 * allow-list has been configured.
 *
 * @param collectionName The collection name to check.
 */
export function isCollectionAllowed(collectionName: string): boolean {
  return !allowedCollections || allowedCollections.has(collectionName)
}

/**
 * Throws a `403` when the collection is not on the configured allow-list.
 * Single choke point used by REST, batch, relation and realtime paths.
 *
 * @param collectionName The collection name to check.
 */
export function assertCollectionAllowed(collectionName: string) {
  if (!isCollectionAllowed(collectionName)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Collection "${collectionName}" is not allowed.`,
    })
  }
}
