import type { Cache, CollectionDefaults, HookDefinitions, StoreSchema } from '@rstore/shared'

type Hooks = HookDefinitions<StoreSchema, CollectionDefaults>

/**
 * `cache.itemMetadata` namespace of collab node rows: `{ docId, version }`,
 * the document version of the cached row (removed with the row).
 */
export const OT_NAMESPACE = 'multiplayer:ot'

/** Value stored in the {@link OT_NAMESPACE} namespace. */
export interface OtItemMetadata {
  docId: string
  /** Document version that last changed the cached row (its `version` field). */
  version: number
}

/** Declares the OT namespace on a cache. Idempotent. */
export function registerOtNamespace(cache: Cache<any, any>): void {
  cache.itemMetadata.register(OT_NAMESPACE, { lifecycle: 'item', persist: true })
}

/**
 * Create the `cacheBeforeWriteItem` handler of OT node collections: a row
 * whose `version` is not newer than the cached one is dropped, so a change
 * applied by the collab client is not applied again when the realtime layer
 * publishes the row (and an older row never overwrites a newer one). Rows
 * without a numeric `version` (partial local writes) are left alone. Field
 * stamps are consumed: node rows are ordered by version, not by clock.
 */
export function createOtWriteHandler(isOtCollection: (name: string) => boolean): Hooks['cacheBeforeWriteItem'] {
  return (payload) => {
    const { store, collection, key, existing, incoming } = payload
    if (!isOtCollection(collection.name)) {
      return
    }
    if (payload.metadata?.fieldTimestamps) {
      payload.consume('fieldTimestamps')
    }
    const version = (incoming as { version?: unknown }).version
    if (typeof version !== 'number') {
      return
    }
    const metadata = store.$cache.itemMetadata
    const cached = metadata.read<OtItemMetadata>(OT_NAMESPACE, collection.name, key)
    if (existing && cached && version <= cached.version) {
      payload.skip()
      return
    }
    const docId = (incoming as { docId?: unknown }).docId ?? (existing as { docId?: unknown } | undefined)?.docId
    metadata.write<OtItemMetadata>(OT_NAMESPACE, collection.name, key, { docId: String(docId), version })
  }
}
