import type { Plugin } from '@rstore/shared'
import type { DirectusRstoreClient } from './client'
import {
  createItem,
  createItems,
  deleteItem,
  deleteItems,
  readItem,
  readItems,
  readSingleton,
  updateItem,
  updateItemsBatch,
  updateSingleton,
} from '@directus/sdk'
import { definePlugin } from '@rstore/core'
import { applyDirectusQuery } from '../filter'
import { createDirectusClient } from './client'
import { DEFAULT_DIRECTUS_SCOPE_ID, getDirectusPrimaryKeys, isDirectusSingleton } from './collection'
import { createDirectusQuery, stripPrimaryKeys } from './query'
import { fetchIncludedRelations, toArray } from './relations'

/**
 * Options used to create the rstore Directus runtime plugin.
 */
export interface CreateDirectusRstorePluginOptions {
  /**
   * Directus API URL used when `client` is not provided.
   */
  url?: string

  /**
   * Existing Directus SDK client to reuse.
   */
  client?: DirectusRstoreClient

  /**
   * rstore plugin scope id for generated Directus collections.
   */
  scopeId?: string
}

/**
 * Creates a Directus-backed rstore plugin.
 */
export function createDirectusRstorePlugin(options: CreateDirectusRstorePluginOptions): Plugin {
  const directus = resolveDirectusClient(options)
  const scopeId = options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID

  return definePlugin({
    name: 'rstore-directus',

    category: 'remote',

    scopeId,

    setup({ hook }) {
      hook('fetchFirst', async (payload) => {
        const query = createDirectusQuery(payload.findOptions as any)

        if (isDirectusSingleton(payload.collection)) {
          payload.setResult(await directus.request(readSingleton(payload.collection.name as any, query as any)) as any)
        }
        else if (payload.key) {
          payload.setResult(await directus.request(readItem(payload.collection.name as any, payload.key, query as any)) as any)
        }
        else {
          const result = await directus.request(readItems(payload.collection.name as any, createDirectusQuery(payload.findOptions as any, {
            limit: 1,
          }) as any)) as any[]
          payload.setResult(result?.[0])
        }
      })

      hook('fetchMany', async (payload) => {
        if (isDirectusSingleton(payload.collection)) {
          const result = await directus.request(readSingleton(payload.collection.name as any, createDirectusQuery(payload.findOptions as any) as any)) as any
          payload.setResult(result ? [result] : [])
          return
        }

        payload.setResult(await directus.request(readItems(payload.collection.name as any, createDirectusQuery(payload.findOptions as any) as any)) as any)
      })

      hook('fetchRelations', async (payload) => {
        const items = toArray(payload.getResult() as any)
        await Promise.all(items.map((item) => {
          return fetchIncludedRelations(payload.store as any, payload.collection as any, item, payload.findOptions.include as any)
        }))
      })

      hook('cacheFilterFirst', (payload) => {
        if (payload.key) {
          return
        }

        const query = createDirectusQuery(payload.findOptions as any, { limit: 1 })
        const evaluation = applyDirectusQuery(payload.readItemsFromCache() as any[], query, {
          collection: payload.collection,
        })
        payload.setResult(evaluation.supported ? evaluation.items[0] : undefined)
      })

      hook('cacheFilterMany', (payload) => {
        const evaluation = applyDirectusQuery(payload.getResult() as any[], createDirectusQuery(payload.findOptions as any), {
          collection: payload.collection,
        })
        payload.setResult(evaluation.supported ? evaluation.items : [])
      })

      hook('createItem', async (payload) => {
        if (isDirectusSingleton(payload.collection)) {
          payload.setResult(await directus.request(updateSingleton(payload.collection.name as any, payload.item as any)) as any)
          return
        }

        payload.setResult(await directus.request(createItem(payload.collection.name as any, payload.item as any)) as any)
      })

      hook('createMany', async (payload) => {
        if (isDirectusSingleton(payload.collection)) {
          const firstItem = payload.items[0]
          if (!firstItem) {
            payload.setResult([])
            return
          }

          const result = await directus.request(updateSingleton(payload.collection.name as any, firstItem as any)) as any
          payload.setResult(result ? [result] : [])
          return
        }

        payload.setResult(await directus.request(createItems(payload.collection.name as any, payload.items as any)) as any)
      })

      hook('updateItem', async (payload) => {
        const item = stripPrimaryKeys(payload.item as Record<string, any>, getDirectusPrimaryKeys(payload.collection))
        if (isDirectusSingleton(payload.collection)) {
          payload.setResult(await directus.request(updateSingleton(payload.collection.name as any, item as any)) as any)
          return
        }

        payload.setResult(await directus.request(updateItem(payload.collection.name as any, payload.key, item as any)) as any)
      })

      hook('updateMany', async (payload) => {
        const primaryKeys = getDirectusPrimaryKeys(payload.collection)
        if (isDirectusSingleton(payload.collection)) {
          const item = stripPrimaryKeys(payload.items[0]?.item as Record<string, any> ?? {}, primaryKeys)
          const result = await directus.request(updateSingleton(payload.collection.name as any, item as any)) as any
          payload.setResult(result ? [result] : [])
          return
        }

        if (primaryKeys.length === 1) {
          const primaryKey = primaryKeys[0]!
          payload.setResult(await directus.request(updateItemsBatch(payload.collection.name as any, payload.items.map(({ key, item }) => ({
            [primaryKey]: key,
            ...stripPrimaryKeys(item as Record<string, any>, primaryKeys),
          })) as any)) as any)
          return
        }

        payload.setResult(await Promise.all(payload.items.map(({ key, item }) => {
          return directus.request(updateItem(payload.collection.name as any, key, stripPrimaryKeys(item as Record<string, any>, primaryKeys) as any))
        })) as any)
      })

      hook('deleteItem', async (payload) => {
        if (!isDirectusSingleton(payload.collection)) {
          await directus.request(deleteItem(payload.collection.name as any, payload.key))
        }
      })

      hook('deleteMany', async (payload) => {
        if (!isDirectusSingleton(payload.collection)) {
          await directus.request(deleteItems(payload.collection.name as any, payload.keys as any))
        }
        payload.abort()
      })
    },
  })
}

/**
 * Resolves or creates the Directus client required by the plugin.
 */
function resolveDirectusClient(options: CreateDirectusRstorePluginOptions): DirectusRstoreClient {
  if (options.client) {
    return options.client
  }
  if (!options.url) {
    throw new Error('Directus URL is required to create the rstore Directus plugin when no client is provided')
  }
  return createDirectusClient({ url: options.url })
}
