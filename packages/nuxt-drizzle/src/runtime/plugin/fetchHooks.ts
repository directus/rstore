import type { VueStore } from '@rstore/vue'
import type { DrizzlePluginContext } from './context'
import SuperJSON from 'superjson'
import { and, eq } from '../utils/where'

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
    const items: any[] = Array.isArray(payloadResult) ? payloadResult : [payloadResult]
    await Promise.all(items.map(item => fetchItemRelations(store, payload, item)))
  })
}

async function fetchItemRelations(store: VueStore, payload: any, item: any) {
  const key = payload.collection.getKey(item)
  if (!key) {
    return
  }
  const wrappedItem = store.$cache.readItem({
    collection: payload.collection,
    key,
  })
  if (!wrappedItem) {
    return
  }

  for (const relationKey in payload.findOptions.include) {
    if (!payload.findOptions.include[relationKey]) {
      continue
    }
    const relation = payload.collection.normalizedRelations[relationKey]
    if (!relation) {
      throw new Error(`Relation "${relationKey}" does not exist on collection "${payload.collection.name}"`)
    }
    await Promise.all(relation.to.map((target: any) => {
      const where: any[] = []
      for (const key in target.on) {
        where.push(eq(key, wrappedItem[target.on[key]!]))
      }
      return store.$collection(target.collection).findMany({
        where: and(...where),
      })
    }))
  }
}
