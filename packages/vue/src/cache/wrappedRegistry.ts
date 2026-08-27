import type { Collection, CollectionDefaults, StoreSchema, WrappedItem } from '@rstore/shared'
import type { WrappedItemMetadata } from '../item'

/** Wrapped proxy and metadata with one shared lifecycle. */
export interface WrappedItemEntry<
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  /** Stable wrapped proxy. */
  item: WrappedItem<Collection, TCollectionDefaults, TSchema>
  /** Query ownership metadata attached to the proxy. */
  metadata: WrappedItemMetadata<Collection, TCollectionDefaults, TSchema>
}

/** Collision-free collection/base-or-layer/key wrapper registry. */
export interface WrappedItemRegistry<
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  /** Read one exact base or layer wrapper entry. */
  get: (collection: string, key: string | number, layerId?: string) => WrappedItemEntry<TCollectionDefaults, TSchema> | undefined
  /** Store one exact base or layer wrapper entry. */
  set: (collection: string, key: string | number, layerId: string | undefined, entry: WrappedItemEntry<TCollectionDefaults, TSchema>) => void
  /** Remove one base wrapper. */
  deleteBase: (collection: string, key: string | number) => void
  /** Remove every wrapper for one exact collection/layer tuple. */
  deleteLayer: (collection: string, layerId: string) => void
  /** Remove every wrapper owned by a collection. */
  deleteCollection: (collection: string) => void
  /** Remove all wrapper entries. */
  clear: () => void
}

/** Per-collection structured wrapper state. */
interface CollectionWrappers<TCollectionDefaults extends CollectionDefaults, TSchema extends StoreSchema> {
  /** Base wrappers by canonical numeric/string id. */
  base: Map<string, WrappedItemEntry<TCollectionDefaults, TSchema>>
  /** Layer wrappers by layer id and canonical item id. */
  layers: Map<string, Map<string, WrappedItemEntry<TCollectionDefaults, TSchema>>>
}

/** Create a structured registry without delimiter-based composite keys. */
export function createWrappedItemRegistry<
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(): WrappedItemRegistry<TCollectionDefaults, TSchema> {
  const collections = new Map<string, CollectionWrappers<TCollectionDefaults, TSchema>>()

  /** Get or create one collection's wrapper maps. */
  function ensureCollection(collection: string): CollectionWrappers<TCollectionDefaults, TSchema> {
    let state = collections.get(collection)
    if (!state) {
      state = { base: new Map(), layers: new Map() }
      collections.set(collection, state)
    }
    return state
  }

  return {
    get(collection, key, layerId) {
      const state = collections.get(collection)
      return layerId !== undefined
        ? state?.layers.get(layerId)?.get(String(key))
        : state?.base.get(String(key))
    },
    set(collection, key, layerId, entry) {
      const state = ensureCollection(collection)
      if (layerId === undefined) {
        state.base.set(String(key), entry)
        return
      }
      const entries = state.layers.get(layerId) ?? new Map()
      state.layers.set(layerId, entries)
      entries.set(String(key), entry)
    },
    deleteBase(collection, key) {
      const state = collections.get(collection)
      state?.base.delete(String(key))
      pruneCollection(collection, state)
    },
    deleteLayer(collection, layerId) {
      const state = collections.get(collection)
      state?.layers.delete(layerId)
      pruneCollection(collection, state)
    },
    deleteCollection(collection) {
      collections.delete(collection)
    },
    clear() {
      collections.clear()
    },
  }

  /** Drop an empty per-collection container. */
  function pruneCollection(
    collection: string,
    state: CollectionWrappers<TCollectionDefaults, TSchema> | undefined,
  ): void {
    if (state && state.base.size === 0 && state.layers.size === 0) {
      collections.delete(collection)
    }
  }
}
