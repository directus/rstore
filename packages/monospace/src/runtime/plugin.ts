import type { Plugin } from '@rstore/shared'
import type { MonospaceRestClient } from './client'
import { definePlugin } from '@rstore/core'
import { applyMonospaceQuery } from '../filter'
import { createMonospaceRestClient } from './client'
import { DEFAULT_MONOSPACE_SCOPE_ID, getMonospaceCollectionName, getMonospacePrimaryKeys } from './collection'
import { applyMonospaceIncludeFields, createMonospaceQuery, stripPrimaryKeys } from './query'
import { fetchMissingMonospaceRelations, normalizeMonospaceRelationItems, toArray } from './relations'
import { buildMonospaceRelationWrites } from './relationWrites'
import { applyMonospaceRelationCachePatches } from './relationWritesCache'

/**
 * Options used to create the rstore Monospace runtime plugin.
 */
export interface CreateMonospaceRstorePluginOptions {
  /**
   * Monospace instance URL used when `client` is not provided.
   */
  url?: string

  /**
   * Monospace project identifier used when `client` is not provided.
   */
  project?: string

  /**
   * Runtime API key used when `client` is not provided.
   */
  apiKey?: string

  /**
   * Existing Monospace REST client to reuse.
   */
  client?: MonospaceRestClient

  /**
   * rstore plugin scope id for generated Monospace collections.
   */
  scopeId?: string
}

/**
 * Creates a Monospace REST-backed rstore plugin.
 */
export function createMonospaceRstorePlugin(options: CreateMonospaceRstorePluginOptions): Plugin {
  const monospace = resolveMonospaceClient(options)
  const scopeId = options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID

  return definePlugin({
    name: 'rstore-monospace',

    category: 'remote',

    scopeId,

    setup({ hook }) {
      hook('fetchFirst', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        const include = (payload.findOptions as any)?.include

        let result: any
        if (payload.key != null) {
          result = await monospace.readOne(collectionName, payload.key, applyMonospaceIncludeFields(createMonospaceQuery(payload.findOptions as any), include, payload.collection as any))
        }
        else {
          const results = await monospace.readMany(collectionName, applyMonospaceIncludeFields(createMonospaceQuery(payload.findOptions as any, {
            limit: 1,
          }), include, payload.collection as any))
          result = results?.[0]
        }

        normalizeMonospaceRelationItems(payload.store as any, payload.collection as any, [result])
        payload.setResult(result)
      })

      hook('fetchMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        const include = (payload.findOptions as any)?.include
        const result = await monospace.readMany(collectionName, applyMonospaceIncludeFields(createMonospaceQuery(payload.findOptions as any), include, payload.collection as any))
        normalizeMonospaceRelationItems(payload.store as any, payload.collection as any, result ?? [])
        payload.setResult(result)
      })

      hook('fetchRelations', async (payload) => {
        await fetchMissingMonospaceRelations(
          payload.store as any,
          payload.collection as any,
          toArray(payload.getResult() as any),
          payload.findOptions.include as any,
        )
      })

      hook('cacheFilterFirst', (payload) => {
        if (payload.key != null) {
          return
        }

        const query = createMonospaceQuery(payload.findOptions as any, { limit: 1 })
        const evaluation = applyMonospaceQuery(payload.readItemsFromCache() as any[], query, {
          collection: payload.collection,
        })
        payload.setResult(evaluation.supported ? evaluation.items[0] : undefined)
      })

      hook('cacheFilterMany', (payload) => {
        const evaluation = applyMonospaceQuery(payload.getResult() as any[], createMonospaceQuery(payload.findOptions as any), {
          collection: payload.collection,
        })
        payload.setResult(evaluation.supported ? evaluation.items : [])
      })

      hook('createItem', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        // Translate form relation operations: FK column writes for to-one
        // relations, Monospace `_connect` operations for to-many relations.
        const writes = buildMonospaceRelationWrites({
          collection: payload.collection as any,
          formOperations: payload.formOperations,
          item: payload.item as Record<string, any>,
          mode: 'create',
          store: payload.store as any,
        })
        const result = await monospace.createOne(collectionName, writes.item, {})
        applyMonospaceRelationCachePatches(payload.store as any, result, writes.patches)
        payload.setResult(result)
      })

      hook('createMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        payload.setResult(await monospace.createMany(collectionName, payload.items as Array<Record<string, any>>, {}))
      })

      hook('updateItem', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        // Translate form relation operations and strip the generated primary
        // keys, which are carried by the endpoint URL.
        const writes = buildMonospaceRelationWrites({
          collection: payload.collection as any,
          formOperations: payload.formOperations,
          item: payload.item as Record<string, any>,
          key: payload.key,
          mode: 'update',
          store: payload.store as any,
        })
        const item = stripPrimaryKeys(writes.item, getMonospacePrimaryKeys(payload.collection))
        const result = await monospace.updateOne(collectionName, payload.key, item, {})
        applyMonospaceRelationCachePatches(payload.store as any, result, writes.patches)
        payload.setResult(result)
      })

      hook('updateMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        const primaryKeys = getMonospacePrimaryKeys(payload.collection)
        payload.setResult(await Promise.all(payload.items.map(({ key, item }) => {
          return monospace.updateOne(collectionName, key, stripPrimaryKeys(item as Record<string, any>, primaryKeys), {})
        })))
      })

      hook('deleteItem', async (payload) => {
        await monospace.deleteOne(getMonospaceCollectionName(payload.collection), payload.key, {})
      })

      hook('deleteMany', async (payload) => {
        if (!payload.keys.length) {
          payload.abort()
          return
        }

        const collectionName = getMonospaceCollectionName(payload.collection)
        const primaryKeys = getMonospacePrimaryKeys(payload.collection)
        if (primaryKeys.length === 1) {
          await monospace.deleteMany(collectionName, {
            filter: {
              [primaryKeys[0]!]: {
                _in: payload.keys,
              },
            },
          })
        }
        else {
          await Promise.all(payload.keys.map((key) => {
            return monospace.deleteOne(collectionName, key, {})
          }))
        }
        payload.abort()
      })
    },
  })
}

/**
 * Resolves or creates the Monospace client required by the plugin.
 */
function resolveMonospaceClient(options: CreateMonospaceRstorePluginOptions): MonospaceRestClient {
  if (options.client) {
    return options.client
  }
  if (!options.url || !options.project) {
    throw new Error('Monospace URL and project are required to create the rstore Monospace plugin when no client is provided')
  }
  return createMonospaceRestClient({
    apiKey: options.apiKey,
    project: options.project,
    url: options.url,
  })
}
