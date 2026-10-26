import type { Collection, CollectionDefaults, CustomHookMeta, FieldTimestamps, FindOptions, ResolvedCollection, StoreCore, StoreSchema, WriteItem } from '@rstore/shared'
import { getMarker } from '../cache'
import { unwrapItem } from '../item'
import { isKeyDefined } from '../key'

/** Inputs shared by fetched results and accepted realtime snapshots. @internal */
export interface ProcessQueryResultParams<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /** Store owning parsing hooks and cache writes. */
  store: StoreCore<TSchema, TCollectionDefaults>
  /** Collection receiving the result. */
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  /** Raw result, with an array for many and an item or null for first. */
  result: any
  /** Whether the result contains several items. */
  many: boolean
  /** Resolved policy controlling cache writes. */
  findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>
  /** Tracking and publication ownership forwarded into queued cache writes. */
  meta: CustomHookMeta
  /** Fetch marker, when the result belongs to a marked cache read. */
  marker?: string
  /** Shared stamps, or per-row stamps aligned with the raw result array. */
  fieldTimestamps?: FieldTimestamps | Array<FieldTimestamps | undefined>
}

/** Parse complete results and write cacheable rows while publication is current. @internal */
export function processQueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({ store, collection, result, many, findOptions, meta, marker, fieldTimestamps }: ProcessQueryResultParams<TCollection, TCollectionDefaults, TSchema>): any {
  if (result == null)
    return result
  const rows = many ? result : [result]
  const parsed = []
  const writes: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> = []
  for (const [index, item] of rows.entries()) {
    // Callers still consume cancelled results: parse every row, fence writes only.
    const value = unwrapItem(item)
    store.$processItemParsing(collection, value)
    parsed.push(value)
    if (findOptions.fetchPolicy === 'no-cache')
      continue
    const key = collection.getKey(value)
    if (!isKeyDefined(key)) {
      console.warn(`Key is undefined for ${collection.name}. Item was not written to cache.`)
      continue
    }
    writes.push({ key, value, fieldTimestamps: Array.isArray(fieldTimestamps) ? fieldTimestamps[index] : fieldTimestamps })
  }
  if (writes.length && meta.$canPublishQuery?.() !== false) {
    if (many) {
      store.$cache.writeItems({ collection, items: writes, marker: marker == null ? undefined : getMarker('many', marker), meta })
    }
    else {
      const { key, value: item, fieldTimestamps } = writes[0]!
      store.$cache.writeItem({ collection, key, item, fieldTimestamps, marker: marker == null ? undefined : getMarker('first', marker), meta })
    }
  }
  return many ? parsed : parsed[0] ?? null
}

/** Apply the item API to complete fetched or pushed results. @internal */
export function wrapQueryResult<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({ store, collection, result, many, noCache }: Pick<ProcessQueryResultParams<TCollection, TCollectionDefaults, TSchema>, 'store' | 'collection' | 'result' | 'many'> & { /** Keep wrappers detached from shared cache state. */ noCache: boolean }): any {
  /** Wrap one parsed row using the resolved cache policy. */
  const wrap = (item: any) => store.$cache.wrapItem({ collection, item, noCache })
  return many ? result?.map(wrap) ?? [] : result ? wrap(result) : null
}
