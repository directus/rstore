import type { Collection, CollectionDefaults, CustomHookMeta, FieldConflict, FieldTimestamps, FieldTimestampValue, GlobalStoreType, ResolvedCollection, StoreSchema } from '@rstore/shared'

/**
 * Write metadata keys handled by `createMultiplayerPlugin()`. They are added to
 * `CustomCacheWriteMetadata` as soon as `@rstore/multiplayer` is in the type graph.
 */
export interface MultiplayerWriteMetadata {
  /** Per-field HLC stamps of a write, for field-level last-writer-wins merge. */
  fieldTimestamps?: FieldTimestamps
  /** Causal time of a delete; records a tombstone that drops older writes. */
  deletedAt?: FieldTimestampValue
}

declare module '@rstore/shared' {
  // Interface merging, not a new type: the metadata gains the multiplayer keys.
  interface CustomCacheWriteMetadata extends MultiplayerWriteMetadata {}

  interface HookDefinitions<
    TSchema extends StoreSchema,
    TCollectionDefaults extends CollectionDefaults,
  > {
    /**
     * Called by `createMultiplayerPlugin()` when a stamped write carries a field
     * with the same stamp as the stored one but a different value, and the
     * conflict policy left it unresolved. The stored value is kept.
     */
    cacheConflict: <
      TCollection extends Collection,
    > (
      payload: {
        store: GlobalStoreType
        meta: CustomHookMeta
        collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
        key: string | number
        conflicts: FieldConflict[]
      },
    ) => void
  }
}
