import type { VueStore } from '@rstore/vue'
import type { DrizzlePluginContext } from './context'
import SuperJSON from 'superjson'
import { and, eq, inArray, or } from '../utils/where'

/** Register network fetch and relation loading hooks. */
export function installFetchHooks(ctx: DrizzlePluginContext, hook: any) {
  hook('fetchFirst', async (payload: any) => {
    if (payload.key) {
      const result = await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}/${payload.key}`, {
        query: { superjson: SuperJSON.stringify({
          ...payload.findOptions?.params,
          include: payload.findOptions?.include,
        }) },
      })
      if (result) {
        payload.setResult(result)
      }
      else {
        console.warn(`No result found for ${payload.collection.name} with key ${payload.key}`)
      }
      return
    }

    const result: any = await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}`, {
      query: { superjson: SuperJSON.stringify({
        where: payload.findOptions?.where,
        ...payload.findOptions?.params,
        limit: 1,
        include: payload.findOptions?.include,
      }) },
    })
    payload.setResult(result?.[0])
  })

  hook('fetchMany', async (payload: any) => {
    const options = {
      where: payload.findOptions?.where,
      ...payload.findOptions?.params,
      include: payload.findOptions?.include,
    }
    if (payload.findOptions?.pageIndex != null && payload.findOptions?.pageSize != null) {
      options.offset = payload.findOptions.pageIndex * payload.findOptions.pageSize
      options.limit = payload.findOptions.pageSize
    }
    payload.setResult(await ctx.requestFetch(`${ctx.apiPath}/${payload.collection.name}`, {
      query: { superjson: SuperJSON.stringify(options) },
    }))
  })

  hook('fetchRelations', async (payload: any) => {
    const store = payload.store as VueStore
    const payloadResult = payload.getResult()
    const items: any[] = (Array.isArray(payloadResult) ? payloadResult : [payloadResult]).filter(item => item != null)
    await fetchRelationsInBatches(store, payload, items)
  })
}

/**
 * Join-value chunk size for a single relation query. Keeps every generated
 * `inArray` / `or` condition under SQL bind-variable limits (SQLite/D1).
 */
const FETCH_RELATIONS_BATCH_SIZE = 50

/** Split values into chunks of {@link FETCH_RELATIONS_BATCH_SIZE}. */
function chunkValues<T>(values: T[]): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += FETCH_RELATIONS_BATCH_SIZE) {
    chunks.push(values.slice(i, i + FETCH_RELATIONS_BATCH_SIZE))
  }
  return chunks
}

/**
 * Fetch the included relations of `items` with one query per relation target
 * (chunked), instead of one query per item per target.
 *
 * The per-item version was an N+1: a list of N results with a relation
 * pointing at a large collection issued N `findMany({ where: eq(...) })`
 * calls, each of which also synchronously scanned the client cache before
 * hitting the network. Batching collects the deduped join values across all
 * items and queries with `inArray` (or `or(and(eq...))` tuples for composite
 * join keys). Items missing from the cache and null join values are skipped —
 * matching the relation proxy, which only resolves fully defined key tuples.
 */
async function fetchRelationsInBatches(store: VueStore, payload: any, items: any[]) {
  const wrappedItems: any[] = []
  for (const item of items) {
    const key = payload.collection.getKey(item)
    if (!key) {
      continue
    }
    const wrappedItem = store.$cache.readItem({
      collection: payload.collection,
      key,
    })
    if (wrappedItem) {
      wrappedItems.push(wrappedItem)
    }
  }
  if (!wrappedItems.length) {
    return
  }

  const queries: Array<Promise<unknown>> = []
  for (const relationKey in payload.findOptions.include) {
    if (!payload.findOptions.include[relationKey]) {
      continue
    }
    const relation = payload.collection.normalizedRelations[relationKey]
    if (!relation) {
      throw new Error(`Relation "${relationKey}" does not exist on collection "${payload.collection.name}"`)
    }
    for (const target of relation.to) {
      const onKeys = Object.keys(target.on)
      if (onKeys.length === 1) {
        const onKey = onKeys[0]!
        const values = new Set<any>()
        for (const wrappedItem of wrappedItems) {
          const value = wrappedItem[target.on[onKey]!]
          if (value != null) {
            values.add(value)
          }
        }
        for (const chunk of chunkValues(Array.from(values))) {
          queries.push(store.$collection(target.collection).findMany({
            where: chunk.length === 1 ? eq(onKey, chunk[0]) : inArray(onKey, chunk),
          }))
        }
      }
      else {
        // Composite join keys: dedupe full tuples, then or() the per-tuple
        // and(eq...) groups so one query covers many parents.
        const seenTuples = new Set<string>()
        const tupleConditions: any[] = []
        for (const wrappedItem of wrappedItems) {
          const values = onKeys.map(onKey => wrappedItem[target.on[onKey]!])
          if (values.some(value => value == null)) {
            continue
          }
          const tupleId = JSON.stringify(values)
          if (seenTuples.has(tupleId)) {
            continue
          }
          seenTuples.add(tupleId)
          tupleConditions.push(and(...onKeys.map((onKey, i) => eq(onKey, values[i]))))
        }
        for (const chunk of chunkValues(tupleConditions)) {
          queries.push(store.$collection(target.collection).findMany({
            where: chunk.length === 1 ? chunk[0] : or(...chunk),
          }))
        }
      }
    }
  }
  await Promise.all(queries)
}
