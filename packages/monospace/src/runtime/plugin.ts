import type { Plugin } from '@rstore/shared'
import type { CreateMonospaceRestClientOptions, MonospaceRestClient } from './client'
import type { MonospaceWorkspaceOptions } from './workspace'
import { definePlugin } from '@rstore/core'
import { applyMonospaceQuery } from '../filter'
import { createMonospaceRestClient } from './client'
import { DEFAULT_MONOSPACE_SCOPE_ID, getMonospaceCollectionName } from './collection'
import { resolveMonospaceItemKey } from './itemKey'
import { registerMonospaceWriteHooks } from './pluginWrites'
import { createMonospaceQuery, createMonospaceReadQuery } from './query'
import { fetchMissingMonospaceRelations, normalizeMonospaceRelationItems, toArray } from './relations'
import { resolveMonospaceWorkspace } from './workspace'

/**
 * Options used to create the rstore Monospace runtime plugin.
 */
export interface CreateMonospaceRstorePluginOptions extends MonospaceWorkspaceOptions {
  /**
   * Monospace instance URL used when `client` is not provided.
   */
  url?: string

  /**
   * Runtime API key used when `client` is not provided.
   */
  apiKey?: string

  /**
   * `Cache-Control` request header used when `client` is not provided.
   * `'no-cache'` bypasses the Monospace server-side read cache.
   */
  cacheControl?: CreateMonospaceRestClientOptions['cacheControl']

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
        const context = { collection: payload.collection as any, store: payload.store as any }

        let result: any
        if (payload.key != null) {
          // Composite keys and collections without item routes resolve to
          // key column values, read through a filtered collection request.
          const key = resolveMonospaceItemKey({ collection: context.collection, key: payload.key, store: context.store })
          result = await monospace.readOne(collectionName, key, createMonospaceReadQuery(payload.findOptions as any, context))
        }
        else {
          const results = await monospace.readMany(collectionName, createMonospaceReadQuery(payload.findOptions as any, context, {
            limit: 1,
          }))
          result = results?.[0]
        }

        normalizeMonospaceRelationItems(payload.store as any, payload.collection as any, [result])
        payload.setResult(result)
      })

      hook('fetchMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        const result = await monospace.readMany(collectionName, createMonospaceReadQuery(payload.findOptions as any, {
          collection: payload.collection as any,
          store: payload.store as any,
        }))
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

      registerMonospaceWriteHooks(hook, monospace)
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
  const workspace = resolveMonospaceWorkspace(options)
  if (!options.url || !workspace) {
    throw new Error('Monospace URL and workspace are required to create the rstore Monospace plugin when no client is provided')
  }
  return createMonospaceRestClient({
    apiKey: options.apiKey,
    cacheControl: options.cacheControl,
    url: options.url,
    workspace,
  })
}
