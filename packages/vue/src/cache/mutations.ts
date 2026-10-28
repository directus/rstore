import type { ApplyMutationOptions, ApplyMutationResult, Collection, CollectionDefaults, ResolvedCollectionItemBase, StoreSchema, WriteItem } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { isKeyDefined } from '@rstore/core'
import { getMutationItemKey, unwrapMutationItem } from '@rstore/shared'

/** Apply a mutation-shaped cache update without emitting mutation hooks. */
export function applyMutationToCache<TCollection extends Collection, TCollectionDefaults extends CollectionDefaults, TSchema extends StoreSchema>(
  ctx: CacheRuntime<TSchema, TCollectionDefaults>,
  params: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema>,
): ApplyMutationResult {
  if (params.mutation === 'delete') {
    return applyDeleteMutation(ctx, params)
  }
  return applyWriteMutation(ctx, params)
}

function applyWriteMutation<TCollection extends Collection, TCollectionDefaults extends CollectionDefaults, TSchema extends StoreSchema>(
  ctx: CacheRuntime<TSchema, TCollectionDefaults>,
  params: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema>,
): ApplyMutationResult {
  const items = getWriteItems(params)
  const many = params.results !== undefined || params.items !== undefined || items.length > 1
  const writes: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> = []
  const result: ApplyMutationResult = { written: [], deleted: [], skipped: 0 }

  for (const [index, item] of items.entries()) {
    const key = getWriteKey(params, item, index)
    if (!isKeyDefined(key)) {
      if (many) {
        console.warn(`Key is undefined for ${params.collection.name}. Item was not written to cache.`)
        result.skipped++
        continue
      }
      throw new Error(`Item ${params.mutation} failed: key is not defined`)
    }
    writes.push({ key, value: item })
    result.written.push(key)
  }

  if (!many && writes.length === 1 && writes[0]) {
    ctx.engine.writeItem({
      collection: params.collection,
      key: writes[0].key,
      item: writes[0].value,
      meta: params.meta,
      fieldTimestamps: params.fieldTimestamps,
    })
  }
  else if (writes.length) {
    ctx.engine.writeItems({
      collection: params.collection,
      items: writes,
      meta: params.meta,
    })
  }

  return result
}

function applyDeleteMutation(
  ctx: CacheRuntime,
  params: ApplyMutationOptions,
): ApplyMutationResult {
  const keys = getDeleteKeys(params)
  const result: ApplyMutationResult = { written: [], deleted: [], skipped: 0 }

  for (const key of keys) {
    ctx.engine.deleteItem({
      collection: params.collection,
      key,
      deletedAt: params.deletedAt,
    })
    result.deleted.push(key)
  }

  return result
}

function getWriteItems<TCollection extends Collection, TCollectionDefaults extends CollectionDefaults, TSchema extends StoreSchema>(
  params: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema>,
): Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> {
  if (params.results !== undefined) {
    return params.results
  }
  if (params.result !== undefined) {
    return [params.result]
  }
  if (params.items) {
    return params.items.map(item => unwrapMutationItem(item)) as Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
  }
  if (params.item !== undefined) {
    return [params.item as ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>]
  }
  return []
}

function getWriteKey<TCollection extends Collection, TCollectionDefaults extends CollectionDefaults, TSchema extends StoreSchema>(
  params: ApplyMutationOptions<TCollection, TCollectionDefaults, TSchema>,
  item: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>,
  index: number,
) {
  return params.keys?.[index] ?? (index === 0 ? params.key : undefined) ?? getMutationItemKey(params.items?.[index]) ?? params.collection.getKey(item)
}

function getDeleteKeys(params: ApplyMutationOptions) {
  if (params.keys) {
    return params.keys
  }
  if (isKeyDefined(params.key)) {
    return [params.key]
  }
  return getWriteItems(params)
    .map((item, index) => getWriteKey(params, item, index))
    .filter(isKeyDefined)
}
