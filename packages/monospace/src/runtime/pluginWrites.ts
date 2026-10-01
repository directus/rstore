import type { PluginSetupApi } from '@rstore/shared'
import type { MonospaceRestClient } from './client'
import type { MonospaceQueryOptions } from './query'
import { getMonospaceCollectionName, getMonospacePrimaryKeys } from './collection'
import { createMonospaceKeysFilter, resolveMonospaceItemKey } from './itemKey'
import { stripPrimaryKeys } from './query'
import { buildMonospaceRelationWrites } from './relationWrites'
import { applyMonospaceRelationCachePatches } from './relationWritesCache'

/**
 * Creates the query sent with create and update requests.
 *
 * Monospace only returns the written items when `fields` is set, and rstore
 * needs them back to update its cache.
 */
function createWriteQuery(): MonospaceQueryOptions {
  return { fields: ['*'] }
}

/**
 * Registers the rstore mutation hooks backed by the Monospace REST client.
 */
export function registerMonospaceWriteHooks(hook: PluginSetupApi['hook'], monospace: MonospaceRestClient): void {
  hook('createItem', async (payload) => {
    const collectionName = getMonospaceCollectionName(payload.collection)
    // Translate form relation operations and FK columns into Monospace
    // nested `_connect` operations, as create inputs reject FK columns.
    const writes = buildMonospaceRelationWrites({
      collection: payload.collection as any,
      formOperations: payload.formOperations,
      item: payload.item as Record<string, any>,
      mode: 'create',
      store: payload.store as any,
    })
    const result = await monospace.createOne(collectionName, writes.item, createWriteQuery())
    applyMonospaceRelationCachePatches(payload.store as any, result, writes.patches)
    payload.setResult(result)
  })

  hook('createMany', async (payload) => {
    const collectionName = getMonospaceCollectionName(payload.collection)
    const items = payload.items.map(item => buildMonospaceRelationWrites({
      collection: payload.collection as any,
      item: item as Record<string, any>,
      mode: 'create',
      store: payload.store as any,
    }).item)
    payload.setResult(await monospace.createMany(collectionName, items, createWriteQuery()))
  })

  hook('updateItem', async (payload) => {
    const collectionName = getMonospaceCollectionName(payload.collection)
    const key = resolveMonospaceItemKey({
      collection: payload.collection as any,
      item: payload.item as Record<string, any>,
      key: payload.key,
      store: payload.store as any,
    })
    // Translate form relation operations and strip the generated primary
    // keys, which are carried by the endpoint URL or key filter.
    const writes = buildMonospaceRelationWrites({
      collection: payload.collection as any,
      formOperations: payload.formOperations,
      item: payload.item as Record<string, any>,
      key: payload.key,
      mode: 'update',
      store: payload.store as any,
    })
    const item = stripPrimaryKeys(writes.item, getMonospacePrimaryKeys(payload.collection))
    const result = await monospace.updateOne(collectionName, key, item, createWriteQuery())
    applyMonospaceRelationCachePatches(payload.store as any, result, writes.patches)
    payload.setResult(result)
  })

  hook('updateMany', async (payload) => {
    const collectionName = getMonospaceCollectionName(payload.collection)
    const primaryKeys = getMonospacePrimaryKeys(payload.collection)
    payload.setResult(await Promise.all(payload.items.map(({ key, item }) => {
      const itemKey = resolveMonospaceItemKey({
        collection: payload.collection as any,
        item: item as Record<string, any>,
        key,
        store: payload.store as any,
      })
      return monospace.updateOne(collectionName, itemKey, stripPrimaryKeys(item as Record<string, any>, primaryKeys), createWriteQuery())
    })))
  })

  hook('deleteItem', async (payload) => {
    await monospace.deleteOne(getMonospaceCollectionName(payload.collection), resolveMonospaceItemKey({
      collection: payload.collection as any,
      key: payload.key,
      store: payload.store as any,
    }))
  })

  hook('deleteMany', async (payload) => {
    if (!payload.keys.length) {
      payload.abort()
      return
    }

    // One filtered request deletes every item: `_in` on a single primary
    // key, an `_or` of key column groups on composite primary keys. The
    // client rejects an empty filter, so this can never delete everything.
    await monospace.deleteMany(getMonospaceCollectionName(payload.collection), {
      filter: createMonospaceKeysFilter({
        collection: payload.collection as any,
        keys: payload.keys,
        store: payload.store as any,
      }) ?? {},
    })
    payload.abort()
  })
}
