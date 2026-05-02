/**
 * Store shape used by the Directus e2e harness.
 */
export interface DirectusE2eStore {
  /** Todos collection API generated from Directus. */
  Todos: any
  /** Projects collection API generated from Directus. */
  Projects: any
  /** Settings singleton collection API generated from Directus. */
  Settings: any
}

/**
 * Throws an error when a case expectation is not met.
 */
export function assertCase(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * Converts a wrapped rstore item to a JSON-safe plain object.
 */
export function plainItem<T extends Record<string, any>>(item: T): Record<string, any> {
  return JSON.parse(JSON.stringify(item))
}

/**
 * Returns public data keys from a wrapped rstore item.
 */
export function publicItemKeys(item: Record<string, any>): string[] {
  return Object.keys(plainItem(item)).filter(key => !key.startsWith('$') && !key.startsWith('_$'))
}

/**
 * Returns sorted todo titles for deterministic assertions.
 */
export function sortedTitles(items: Array<Record<string, any>>): string[] {
  return items.map(item => item.title).sort()
}

/**
 * Creates one todo item with defaults suitable for adapter tests.
 */
export async function createTodo(store: DirectusE2eStore, item: Record<string, any>) {
  return await store.Todos.create({
    completed: false,
    priority: 0,
    ...item,
  }, {
    optimistic: false,
  })
}

/**
 * Creates multiple todo items with defaults suitable for adapter tests.
 */
export async function createTodos(store: DirectusE2eStore, items: Array<Record<string, any>>) {
  return await store.Todos.createMany(items.map(item => ({
    completed: false,
    priority: 0,
    ...item,
  })), {
    optimistic: false,
  })
}

/**
 * Reads one item by key and returns null when Directus reports it missing.
 */
export async function findOptionalByKey(collection: any, key: string | number) {
  try {
    return await collection.findFirst({
      key,
      fetchPolicy: 'no-cache',
    })
  }
  catch {
    return null
  }
}

/**
 * Deletes keys one by one while ignoring already-deleted rows.
 */
export async function deleteOptionalKeys(collection: any, keys: Array<string | number | undefined>) {
  for (const key of keys) {
    if (key == null) {
      continue
    }
    try {
      await collection.delete(key, { optimistic: false })
    }
    catch {}
  }
}
