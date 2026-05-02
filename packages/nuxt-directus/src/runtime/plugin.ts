// @ts-expect-error virtual module
import { scopeId, url } from '#build/$rstore-directus-config.js'
import { useNuxtApp } from '#imports'
import {
  authentication,
  createDirectus,
  createItem,
  createItems,
  deleteItem,
  deleteItems,
  readItem,
  readItems,
  readSingleton,
  rest,
  updateItem,
  updateItemsBatch,
  updateSingleton,
} from '@directus/sdk'
import { definePlugin } from '@rstore/vue'
import { applyDirectusQuery } from './filter'
import { createDirectusQuery, stripPrimaryKeys } from './query'

export default definePlugin({
  name: 'rstore-directus',

  category: 'remote',

  scopeId,

  setup({ hook }) {
    const directus = createDirectus(url)
      .with(rest())
      .with(authentication())

    const nuxt = useNuxtApp()
    nuxt.$directus = directus

    hook('fetchFirst', async (payload) => {
      const query = createDirectusQuery(payload.findOptions as any)

      if (isSingleton(payload.collection)) {
        payload.setResult(await directus.request(readSingleton(payload.collection.name as any, query as any)))
      }
      else if (payload.key) {
        payload.setResult(await directus.request(readItem(payload.collection.name as any, payload.key, query as any)))
      }
      else {
        const result = await directus.request(readItems(payload.collection.name as any, createDirectusQuery(payload.findOptions as any, {
          limit: 1,
        }) as any))
        payload.setResult(result?.[0])
      }
    })

    hook('fetchMany', async (payload) => {
      if (isSingleton(payload.collection)) {
        const result = await directus.request(readSingleton(payload.collection.name as any, createDirectusQuery(payload.findOptions as any) as any))
        payload.setResult(result ? [result] : [])
        return
      }

      payload.setResult(await directus.request(readItems(payload.collection.name as any, createDirectusQuery(payload.findOptions as any) as any)))
    })

    hook('fetchRelations', async (payload) => {
      const items = toArray(payload.getResult())
      await Promise.all(items.map(item => fetchIncludedRelations(payload.store as any, payload.collection, item, payload.findOptions.include)))
    })

    hook('cacheFilterFirst', (payload) => {
      if (payload.key) {
        return
      }

      const query = createDirectusQuery(payload.findOptions as any, { limit: 1 })
      const evaluation = applyDirectusQuery(payload.readItemsFromCache(), query, {
        collection: payload.collection,
      })
      payload.setResult(evaluation.supported ? evaluation.items[0] : undefined)
    })

    hook('cacheFilterMany', (payload) => {
      const evaluation = applyDirectusQuery(payload.getResult(), createDirectusQuery(payload.findOptions as any), {
        collection: payload.collection,
      })
      payload.setResult(evaluation.supported ? evaluation.items : [])
    })

    hook('createItem', async (payload) => {
      if (isSingleton(payload.collection)) {
        payload.setResult(await directus.request(updateSingleton(payload.collection.name as any, payload.item as any)))
        return
      }

      payload.setResult(await directus.request(createItem(payload.collection.name as any, payload.item as any)))
    })

    hook('createMany', async (payload) => {
      if (isSingleton(payload.collection)) {
        const result = await directus.request(updateSingleton(payload.collection.name as any, payload.items[0] as any))
        payload.setResult(result ? [result] : [])
        return
      }

      payload.setResult(await directus.request(createItems(payload.collection.name as any, payload.items as any)))
    })

    hook('updateItem', async (payload) => {
      const item = stripPrimaryKeys(payload.item as Record<string, any>, payload.collection.meta?.primaryKeys)
      if (isSingleton(payload.collection)) {
        payload.setResult(await directus.request(updateSingleton(payload.collection.name as any, item as any)))
        return
      }

      payload.setResult(await directus.request(updateItem(payload.collection.name as any, payload.key, item as any)))
    })

    hook('updateMany', async (payload) => {
      const primaryKeys = payload.collection.meta?.primaryKeys ?? []
      if (isSingleton(payload.collection)) {
        const item = stripPrimaryKeys(payload.items[0]?.item ?? {}, primaryKeys)
        const result = await directus.request(updateSingleton(payload.collection.name as any, item as any))
        payload.setResult(result ? [result] : [])
        return
      }

      if (primaryKeys.length === 1) {
        payload.setResult(await directus.request(updateItemsBatch(payload.collection.name as any, payload.items.map(({ key, item }) => ({
          [primaryKeys[0]!]: key,
          ...stripPrimaryKeys(item as Record<string, any>, primaryKeys),
        })) as any)))
        return
      }

      payload.setResult(await Promise.all(payload.items.map(({ key, item }) => {
        return directus.request(updateItem(payload.collection.name as any, key, stripPrimaryKeys(item as Record<string, any>, primaryKeys) as any))
      })))
    })

    hook('deleteItem', async (payload) => {
      if (!isSingleton(payload.collection)) {
        await directus.request(deleteItem(payload.collection.name as any, payload.key))
      }
    })

    hook('deleteMany', async (payload) => {
      if (!isSingleton(payload.collection)) {
        await directus.request(deleteItems(payload.collection.name as any, payload.keys))
      }
      payload.abort()
    })
  },
})

/**
 * Returns whether a generated collection represents a Directus singleton.
 */
function isSingleton(collection: { meta?: { directus?: { singleton?: boolean } } }): boolean {
  return collection.meta?.directus?.singleton === true
}

/**
 * Normalizes a possible single result to an array.
 */
function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/**
 * Fetches rstore included relations through Directus filters.
 */
async function fetchIncludedRelations(
  store: any,
  collection: any,
  item: Record<string, any>,
  include: Record<string, any>,
): Promise<void> {
  const itemKey = collection.getKey(item)
  if (itemKey == null) {
    return
  }

  for (const relationKey in include) {
    if (!include[relationKey]) {
      continue
    }

    const relation = collection.normalizedRelations[relationKey]
    if (!relation) {
      throw new Error(`Relation "${relationKey}" does not exist on collection "${collection.name}"`)
    }

    await Promise.all(relation.to.map((target: any) => {
      const filter = createRelationFilter(target.on, item)
      const options = typeof include[relationKey] === 'object' && 'include' in include[relationKey]
        ? { filter, include: include[relationKey].include }
        : { filter }
      return store.$collection(target.collection).findMany(options)
    }))
  }
}

/**
 * Creates a Directus filter for a normalized rstore relation target.
 */
function createRelationFilter(on: Record<string, string>, item: Record<string, any>): Record<string, any> {
  const filters = Object.entries(on).map(([targetField, sourceField]) => ({
    [targetField]: {
      _eq: item[sourceField],
    },
  }))

  return filters.length === 1 ? filters[0]! : { _and: filters }
}
