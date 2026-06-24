import type { ApplyMutationOptions } from '@rstore/shared'
import { getMutationItemKey, unwrapMutationItem } from '@rstore/shared'
import { isKeyDefined } from '../../key'

/** Validate that a finalized cache mutation has enough key data to apply. */
export function validateCommittedCacheKeys(
  options: ApplyMutationOptions,
  missingCacheKeyError: string | undefined,
) {
  if (!missingCacheKeyError) {
    return
  }

  if (options.mutation === 'delete') {
    if (!hasDeleteCacheTarget(options)) {
      throw new Error(missingCacheKeyError)
    }
    return
  }

  const items = options.results ?? (options.result ? [options.result] : [])
  for (const [index, item] of items.entries()) {
    const key = options.keys?.[index] ?? (index === 0 ? options.key : undefined) ?? options.collection.getKey(item)
    if (!isKeyDefined(key)) {
      throw new Error(missingCacheKeyError)
    }
  }
}

function hasDeleteCacheTarget(options: ApplyMutationOptions) {
  if (options.keys?.length || isKeyDefined(options.key)) {
    return true
  }

  const items = options.results
    ?? (options.result ? [options.result] : undefined)
    ?? options.items
    ?? (options.item ? [options.item] : [])

  return items.some(item => isKeyDefined(getMutationItemKey(item) ?? options.collection.getKey(unwrapMutationItem(item as any))))
}
