import type { ApplyMutationOptions, ApplyMutationResult } from '@rstore/shared'
import { getMutationItemKey, unwrapMutationItem } from '@rstore/shared'
import { isKeyDefined } from '../../src/key'

/** Apply mutation options to the cache spies used by core mutation unit tests. */
export function applyMutationToMockCache(cache: any, params: ApplyMutationOptions): ApplyMutationResult {
  if (params.mutation === 'delete') {
    return applyDeleteMutation(cache, params)
  }
  return applyWriteMutation(cache, params)
}

function applyWriteMutation(cache: any, params: ApplyMutationOptions): ApplyMutationResult {
  const items = getWriteItems(params)
  const many = params.results !== undefined || params.items !== undefined || items.length > 1
  const writes: Array<{ key: string | number, value: any }> = []
  const result: ApplyMutationResult = { written: [], deleted: [], skipped: 0 }

  for (const [index, item] of items.entries()) {
    const key = params.keys?.[index] ?? (index === 0 ? params.key : undefined) ?? getMutationItemKey(params.items?.[index]) ?? params.collection.getKey(item)
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
    cache.writeItem?.({ collection: params.collection, key: writes[0].key, item: writes[0].value })
  }
  else if (writes.length) {
    cache.writeItems?.({ collection: params.collection, items: writes })
  }

  return result
}

function applyDeleteMutation(cache: any, params: ApplyMutationOptions): ApplyMutationResult {
  const result: ApplyMutationResult = { written: [], deleted: [], skipped: 0 }
  const keys = params.keys ?? (isKeyDefined(params.key) ? [params.key] : [])

  for (const key of keys) {
    cache.deleteItem?.({ collection: params.collection, key })
    result.deleted.push(key)
  }

  return result
}

function getWriteItems(params: ApplyMutationOptions) {
  if (params.results !== undefined)
    return params.results
  if (params.result !== undefined)
    return [params.result]
  if (params.items)
    return params.items.map(item => unwrapMutationItem(item))
  if (params.item !== undefined)
    return [params.item]
  return []
}
