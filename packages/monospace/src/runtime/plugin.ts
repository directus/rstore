import type { Plugin } from '@rstore/shared'
import type { MonospaceRestClient } from './client'
import { definePlugin } from '@rstore/core'
import { createMonospaceRestClient } from './client'
import { DEFAULT_MONOSPACE_SCOPE_ID, getMonospaceCollectionName, getMonospacePrimaryKeys } from './collection'
import { createMonospaceQuery, stripPrimaryKeys } from './query'

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
        if (payload.key != null) {
          payload.setResult(await monospace.readOne(collectionName, payload.key, createMonospaceQuery(payload.findOptions as any)))
          return
        }

        const result = await monospace.readMany(collectionName, createMonospaceQuery(payload.findOptions as any, {
          limit: 1,
        }))
        payload.setResult(result?.[0])
      })

      hook('fetchMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        payload.setResult(await monospace.readMany(collectionName, createMonospaceQuery(payload.findOptions as any)))
      })

      hook('createItem', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        payload.setResult(await monospace.createOne(collectionName, payload.item as any, {}))
      })

      hook('createMany', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        payload.setResult(await monospace.createMany(collectionName, payload.items as any, {}))
      })

      hook('updateItem', async (payload) => {
        const collectionName = getMonospaceCollectionName(payload.collection)
        const item = stripPrimaryKeys(payload.item as Record<string, any>, getMonospacePrimaryKeys(payload.collection))
        payload.setResult(await monospace.updateOne(collectionName, payload.key, item, {}))
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
