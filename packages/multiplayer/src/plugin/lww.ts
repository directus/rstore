import type { CollectionDefaults, FieldTimestamps, HookDefinitions, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { ConflictPolicy, TombstoneStore } from '../lww/index.js'
import { applyConflictPolicy, mergeItemFields, shouldResurrect } from '../lww/index.js'
import { createTombstoneView, FIELD_TIMESTAMPS_NAMESPACE } from './store.js'

type Hooks = HookDefinitions<StoreSchema, CollectionDefaults>

/** Resolved `lww` options of `createMultiplayerPlugin()`. */
export interface LwwHandlerOptions {
  /** Collections to apply LWW to; all when omitted. */
  collections?: string[] | ((collection: ResolvedCollection) => boolean)
  /** Resolution of equal-stamp conflicts. */
  conflictPolicy: ConflictPolicy
}

/** Turn a `collections` option into a predicate. */
export function createCollectionFilter(collections: LwwHandlerOptions['collections']): (collection: ResolvedCollection) => boolean {
  if (!collections) {
    return () => true
  }
  if (typeof collections === 'function') {
    return collections
  }
  const names = new Set(collections)
  return collection => names.has(collection.name)
}

/**
 * Create the `cacheBeforeWriteItem` handler: drops writes older than the
 * item's tombstone and merges stamped writes field by field.
 *
 * Writes without `fieldTimestamps` are left to the default cache merge; they
 * keep the stored stamps (local commits are not stamped).
 */
export function createLwwWriteHandler(options: LwwHandlerOptions): Hooks['cacheBeforeWriteItem'] {
  const isSelected = createCollectionFilter(options.collections)
  // One plugin setup serves one store, so the view is created once.
  let tombstones: TombstoneStore | undefined
  return (payload) => {
    const { store, collection, key, existing, incoming } = payload
    if (!isSelected(collection as ResolvedCollection)) {
      return
    }
    const stamps = payload.metadata?.fieldTimestamps
    if (stamps) {
      payload.consume('fieldTimestamps')
    }
    const cache = store.$cache
    tombstones ??= createTombstoneView(cache)
    const tombstone = tombstones.get(collection.name, key)
    if (tombstone) {
      // A write stamped before the delete must not resurrect the row. An
      // unstamped write is an explicit local write and always lands.
      if (stamps && !shouldResurrect(tombstone, stamps)) {
        payload.skip()
        return
      }
      tombstones.clear(collection.name, key)
    }
    if (!stamps) {
      return
    }
    if (!existing) {
      cache.itemMetadata.write<FieldTimestamps>(FIELD_TIMESTAMPS_NAMESPACE, collection.name, key, { ...stamps })
      return
    }
    const local = cache.itemMetadata.read<FieldTimestamps>(FIELD_TIMESTAMPS_NAMESPACE, collection.name, key) ?? {}
    const result = mergeItemFields(existing as Record<string, any>, incoming as Record<string, any>, local, stamps)
    const conflicts = applyConflictPolicy(result, options.conflictPolicy, { collection: collection.name, key })
    cache.itemMetadata.write(FIELD_TIMESTAMPS_NAMESPACE, collection.name, key, result.mergedTimestamps)
    payload.setValue(result.merged)
    if (conflicts.length) {
      store.$hooks.callHookSync('cacheConflict', {
        store,
        meta: {},
        collection,
        key,
        conflicts,
      })
    }
  }
}

/**
 * Create the `cacheBeforeDeleteItem` handler: a delete carrying `deletedAt`
 * records a tombstone (the later of two deletes is kept). Field stamps are
 * removed with the row by the cache (`item` lifecycle).
 */
export function createLwwDeleteHandler(options: LwwHandlerOptions): Hooks['cacheBeforeDeleteItem'] {
  const isSelected = createCollectionFilter(options.collections)
  return (payload) => {
    const deletedAt = payload.metadata?.deletedAt
    if (deletedAt == null || !isSelected(payload.collection as ResolvedCollection)) {
      return
    }
    payload.consume('deletedAt')
    createTombstoneView(payload.store.$cache).set({ collection: payload.collection.name, key: payload.key, deletedAt })
  }
}
