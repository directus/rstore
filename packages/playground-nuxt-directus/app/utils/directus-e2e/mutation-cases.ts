import type { DirectusE2eStore } from './helpers'
import { assertCase, createTodo, createTodos, deleteOptionalKeys, findOptionalByKey, sortedTitles } from './helpers'

/**
 * Runs Directus createItems, updateItemsBatch, deleteItems, and update stripping coverage.
 */
export async function runBulkMutationCase(store: DirectusE2eStore, prefix: string) {
  const created = await createTodos(store, [
    bulkTodo(prefix, 'a'),
    bulkTodo(prefix, 'b'),
    bulkTodo(prefix, 'c'),
  ])
  const updated = await store.Todos.updateMany([
    { id: created[0].id, title: `${prefix}-bulk-a-updated` },
    { id: created[1].id, title: `${prefix}-bulk-b-updated` },
  ], {
    optimistic: false,
  })

  await store.Todos.deleteMany(created.map((item: any) => item.id), {
    optimistic: false,
  })

  const remainingBulk = await store.Todos.findMany({
    filter: { status: { _eq: `${prefix}-bulk` } },
    fetchPolicy: 'no-cache',
  })
  const stripped = await runPrimaryKeyStripCheck(store, prefix)

  return {
    ok: true,
    createdCount: created.length,
    updatedTitles: sortedTitles(updated),
    remainingBulkCount: remainingBulk.length,
    strippedKeyTitle: stripped.keyTitle,
    strippedWrongKeyExists: stripped.wrongKeyExists,
  }
}

/**
 * Runs Directus singleton read and update coverage.
 */
export async function runSingletonCase(store: DirectusE2eStore, prefix: string) {
  await store.Settings.update({
    site_name: `${prefix}-settings`,
    maintenance: true,
    version: 2,
  }, {
    key: 'singleton',
    optimistic: false,
  })

  const first = await store.Settings.findFirst({
    fields: ['site_name', 'maintenance', 'version'],
    fetchPolicy: 'no-cache',
  })
  const many = await store.Settings.findMany({
    fields: ['site_name', 'maintenance', 'version'],
    fetchPolicy: 'no-cache',
  })

  assertCase(first?.site_name === `${prefix}-settings`, 'singleton read should include the updated site name')

  return {
    ok: true,
    key: store.Settings.getKey(first),
    foundManyCount: many.length,
    siteName: first.site_name,
  }
}

/**
 * Creates one bulk mutation todo payload.
 */
function bulkTodo(prefix: string, suffix: string) {
  return {
    title: `${prefix}-bulk-${suffix}`,
    status: `${prefix}-bulk`,
    priority: suffix.charCodeAt(0),
  }
}

/**
 * Verifies update bodies do not mutate Directus primary keys.
 */
async function runPrimaryKeyStripCheck(store: DirectusE2eStore, prefix: string) {
  const source = await createTodo(store, {
    title: `${prefix}-bulk-strip`,
    status: `${prefix}-strip`,
    priority: 99,
  })
  const wrongKey = source.id + 1_000_000

  await store.Todos.update({
    id: wrongKey,
    title: `${prefix}-bulk-strip-updated`,
    status: `${prefix}-strip`,
  }, {
    key: source.id,
    optimistic: false,
  })

  const actual = await findOptionalByKey(store.Todos, source.id)
  const wrong = await findOptionalByKey(store.Todos, wrongKey)
  await deleteOptionalKeys(store.Todos, [actual?.id, wrong?.id])

  assertCase(actual?.title === `${prefix}-bulk-strip-updated`, 'update should keep the original primary key')

  return {
    keyTitle: actual.title,
    wrongKeyExists: Boolean(wrong),
  }
}
