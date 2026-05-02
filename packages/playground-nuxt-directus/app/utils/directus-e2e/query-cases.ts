import type { DirectusE2eStore } from './helpers'
import { assertCase, createTodos, publicItemKeys, sortedTitles } from './helpers'

/**
 * Runs Directus item read/query option coverage.
 */
export async function runQueryCase(store: DirectusE2eStore, prefix: string) {
  const [itemA] = await createTodos(store, [
    queryTodo(prefix, 'a', 1, 'alpha-search-token'),
    queryTodo(prefix, 'b', 2, 'beta-search-token'),
    queryTodo(prefix, 'c', 3, 'gamma-search-token'),
  ])

  const projected = await store.Todos.findMany({
    fields: ['id', 'title'],
    filter: { title: { _eq: `${prefix}-query-a` } },
    fetchPolicy: 'no-cache',
  })
  const keyItem = await store.Todos.findFirst({
    key: itemA.id,
    fields: ['id', 'title'],
    fetchPolicy: 'no-cache',
  })
  const filtered = await readQueryTodos(store, prefix, {
    filter: { priority: { _eq: 2 } },
  })
  const searched = await readQueryTodos(store, prefix, {
    search: 'gamma-search-token',
  })
  const sorted = await readQueryTodos(store, prefix, {
    sort: ['-priority'],
  })
  const limited = await readQueryTodos(store, prefix, {
    sort: ['priority'],
    limit: 2,
  })
  const offset = await readQueryTodos(store, prefix, {
    sort: ['priority'],
    limit: 1,
    offset: 1,
  })
  const page = await readQueryTodos(store, prefix, {
    sort: ['priority'],
    limit: 1,
    page: 2,
  })
  const pageIndex = await readQueryTodos(store, prefix, {
    sort: ['priority'],
    pageIndex: 2,
    pageSize: 1,
  })
  const params = await store.Todos.findMany({
    params: {
      fields: ['id', 'title'],
      filter: { title: { _eq: `${prefix}-query-a` } },
    },
    fetchPolicy: 'no-cache',
  })

  assertCase(projected.length === 1, 'fields query should return one projected item')
  assertCase(keyItem?.title === `${prefix}-query-a`, 'key read should return the first created item')

  return {
    ok: true,
    projectedKeys: publicItemKeys(projected[0]),
    keyTitle: keyItem.title,
    filteredTitles: sortedTitles(filtered),
    searchedTitles: sortedTitles(searched),
    sortedTitles: sorted.map((item: any) => item.title),
    limitedTitles: limited.map((item: any) => item.title),
    offsetTitles: offset.map((item: any) => item.title),
    pageTitles: page.map((item: any) => item.title),
    pageIndexTitles: pageIndex.map((item: any) => item.title),
    paramsTitles: sortedTitles(params),
  }
}

/**
 * Runs Directus cache-side filter and fetch fallback coverage.
 */
export async function runCacheOperatorCase(store: DirectusE2eStore, prefix: string) {
  await createTodos(store, [
    cacheTodo(prefix, 'a', false, 1, 'open', 'Alpha note'),
    cacheTodo(prefix, 'b', true, 3, 'closed', 'Beta needle note'),
    cacheTodo(prefix, 'c', false, 5, null, 'Gamma note'),
    cacheTodo(prefix, 'search', false, 7, 'fallback', 'Directus fallback token'),
  ])

  await store.Todos.findMany({
    filter: { title: { _icontains: `${prefix}-cache` } },
    fetchPolicy: 'fetch-only',
  })

  const eq = peekCacheTodos(store, prefix, { completed: { _eq: false }, priority: { _eq: 1 } })
  const neq = peekCacheTodos(store, prefix, { priority: { _neq: 1 } })
  const range = peekCacheTodos(store, prefix, { priority: { _between: [2, 5] } })
  const nullItems = peekCacheTodos(store, prefix, { status: { _null: true } })
  const text = peekCacheTodos(store, prefix, { notes: { _icontains: 'NEEDLE' } })
  const logical = store.Todos.peekMany({
    filter: {
      _and: [
        { title: { _icontains: `${prefix}-cache` } },
        {
          _or: [
            { notes: { _icontains: 'needle' } },
            { priority: { _gte: 10 } },
          ],
        },
      ],
    },
    sort: ['title'],
  })
  const search = await store.Todos.findMany({
    fields: ['id', 'title'],
    search: 'Directus fallback token',
    filter: { title: { _icontains: prefix } },
    fetchPolicy: 'cache-first',
  })

  return {
    ok: true,
    eqTitles: sortedTitles(eq),
    neqTitles: sortedTitles(neq),
    rangeTitles: sortedTitles(range),
    nullTitles: sortedTitles(nullItems),
    textTitles: sortedTitles(text),
    logicalTitles: sortedTitles(logical),
    searchTitle: search[0]?.title,
  }
}

/**
 * Creates one query case todo payload.
 */
function queryTodo(prefix: string, suffix: string, priority: number, notes: string) {
  return {
    title: `${prefix}-query-${suffix}`,
    priority,
    status: `${prefix}-query`,
    notes,
  }
}

/**
 * Creates one cache case todo payload.
 */
function cacheTodo(prefix: string, suffix: string, completed: boolean, priority: number, status: string | null, notes: string) {
  return {
    title: `${prefix}-cache-${suffix}`,
    completed,
    priority,
    status,
    notes,
  }
}

/**
 * Reads cache-backed todos through Directus-compatible filter evaluation.
 */
function peekCacheTodos(store: DirectusE2eStore, prefix: string, filter: Record<string, any>) {
  return store.Todos.peekMany({
    filter: {
      _and: [
        { title: { _icontains: `${prefix}-cache` } },
        { status: { _neq: 'fallback' } },
        filter,
      ],
    },
    sort: ['title'],
  })
}

/**
 * Reads query case todos from Directus with stable default fields and filter.
 */
async function readQueryTodos(store: DirectusE2eStore, prefix: string, options: Record<string, any>) {
  const { filter, ...rest } = options
  return await store.Todos.findMany({
    fields: ['id', 'title', 'priority'],
    ...rest,
    filter: {
      _and: [
        { status: { _eq: `${prefix}-query` } },
        ...(filter ? [filter] : []),
      ],
    },
    fetchPolicy: 'no-cache',
  })
}
