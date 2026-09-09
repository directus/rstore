import type { Cache } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { isKeyDefined } from '@rstore/core'

/**
 * Resolve a nested relation payload into parameters for a cache item write.
 *
 * @param ctx Cache runtime used to find relation target collections.
 * @param params Public relation-write parameters.
 * @param params.parentCollection Parent collection that declares relation.
 * @param params.relationKey Parent relation field name.
 * @param params.relation Relation definition used to select targets.
 * @param params.childItem Nested item to write.
 * @param params.meta Write metadata forwarded unchanged.
 * @returns Resolved parameters for a cache item write.
 */
export function resolveRelationWriteParams(
  ctx: CacheRuntime,
  { parentCollection, relationKey, relation, childItem, meta }: Parameters<Cache['writeItemForRelation']>[0],
): Parameters<Cache['writeItem']>[0] {
  const possibleCollections = Object.keys(relation.to)
  const nestedItemCollection = ctx.getStore().$getCollection(childItem, possibleCollections)
  if (!nestedItemCollection) {
    throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  const nestedKey = nestedItemCollection.getKey(childItem)
  if (!isKeyDefined(nestedKey)) {
    throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  return {
    collection: nestedItemCollection,
    key: nestedKey,
    item: childItem,
    meta,
  }
}
