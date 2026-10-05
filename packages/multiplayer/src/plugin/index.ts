import type { Plugin, ResolvedCollection } from '@rstore/shared'
import type { ConflictPolicy } from '../lww/index.js'
import type { TombstoneGcOptions } from './tombstoneGc.js'
import { textFieldMerger } from './formMerge.js'
import { createCollectionFilter, createLwwDeleteHandler, createLwwWriteHandler } from './lww.js'
import { createOtWriteHandler, registerOtNamespace } from './ot.js'
import { registerMultiplayerNamespaces } from './store.js'
import { startTombstoneGc } from './tombstoneGc.js'

export type { MultiplayerWriteMetadata } from './augment.js'
export { textFieldMerger } from './formMerge.js'
export { OT_NAMESPACE } from './ot.js'
export type { OtItemMetadata } from './ot.js'
export { bindCollabCache } from './otBinding.js'
export type { CollabCacheBindingOptions, CollabCacheStoreLike } from './otBinding.js'
export { FIELD_TIMESTAMPS_NAMESPACE, gcTombstones, getFieldTimestamps, getTombstone, setFieldTimestamps, TOMBSTONE_NAMESPACE, tombstoneEntries } from './store.js'
export type { MultiplayerStoreLike } from './store.js'
export type { TombstoneGcOptions } from './tombstoneGc.js'

/** Options of {@link createMultiplayerPlugin}. */
export interface MultiplayerPluginOptions {
  /**
   * Field-level last-writer-wins merge of writes stamped with
   * `metadata.fieldTimestamps`, and tombstones for deletes with
   * `metadata.deletedAt`. `false` disables both.
   * @default true
   */
  lww?: boolean | {
    /** Collections to apply LWW to. @default all */
    collections?: string[] | ((collection: ResolvedCollection) => boolean)
    /** Resolution of equal-stamp, different-value writes. @default 'lww' (keep local, emit `cacheConflict`) */
    conflictPolicy?: ConflictPolicy
  }
  /**
   * Periodic tombstone GC on client stores. `false` disables it.
   * @default { intervalMs: 60_000, ttlMs: 86_400_000 }
   */
  tombstoneGc?: false | TombstoneGcOptions
  /**
   * Merge non-overlapping concurrent text edits during form `$rebase`
   * (`formFieldMerge` hook with {@link textFieldMerger}). Without it, a field
   * changed on both sides is a conflict.
   * @default true
   */
  formTextMerge?: boolean
  /**
   * Collections holding collab document nodes (rich-text OT, experimental).
   * Their rows are ordered by `version`: a write that is not newer than
   * the cached row is dropped, and field LWW does not apply to them. Mirror
   * a collab client into them with {@link bindCollabCache}.
   */
  ot?: {
    collections: string[] | ((collection: ResolvedCollection) => boolean)
  }
}

/**
 * `createStore({ tombstoneGc })` from `@rstore/vue` before 0.9, exposed by the
 * store for this plugin until 0.10.
 */
function getDeprecatedStoreOption(store: object): MultiplayerPluginOptions['tombstoneGc'] {
  return (store as { $deprecatedStoreOptions?: Pick<MultiplayerPluginOptions, 'tombstoneGc'> }).$deprecatedStoreOptions?.tombstoneGc
}

/**
 * Create the rstore plugin that applies multiplayer cache semantics through
 * the cache extension points:
 *
 * - stamped writes (`metadata.fieldTimestamps`) merge field by field, the
 *   newest stamp winning; equal stamps follow `lww.conflictPolicy`;
 * - deletes with `metadata.deletedAt` leave a tombstone that drops older
 *   writes, swept by a GC timer stopped when the cache is disposed;
 * - stamps and tombstones live in `cache.itemMetadata`
 *   (`multiplayer:fields`, `multiplayer:tombstone`) and cross SSR;
 * - form `$rebase` merges non-overlapping text edits (`formTextMerge`).
 *
 * ```ts
 * createStore({ schema, plugins: [createMultiplayerPlugin()] })
 * ```
 */
export function createMultiplayerPlugin(options: MultiplayerPluginOptions = {}): Plugin {
  const lww = options.lww ?? true
  return {
    name: 'rstore-multiplayer',
    category: 'processing',
    setup(api) {
      let stopTombstoneGc: (() => void) | undefined
      // `init` runs before `createStore` returns, so the namespaces exist
      // before any SSR `setState` restores them.
      api.hook('init', ({ store }) => {
        registerMultiplayerNamespaces(store.$cache)
        if (options.ot) {
          registerOtNamespace(store.$cache)
        }
        if (lww) {
          stopTombstoneGc = startTombstoneGc(store, options.tombstoneGc ?? getDeprecatedStoreOption(store) ?? {})
        }
      })
      api.hook('dispose', () => {
        stopTombstoneGc?.()
        stopTombstoneGc = undefined
      })
      const isOt = options.ot ? createCollectionFilter(options.ot.collections) : () => false
      if (options.ot) {
        api.hook('cacheBeforeWriteItem', createOtWriteHandler(name => isOt({ name } as ResolvedCollection)))
      }
      if (lww) {
        const isLww = createCollectionFilter(lww === true ? undefined : lww.collections)
        const handlerOptions = {
          collections: (collection: ResolvedCollection) => isLww(collection) && !isOt(collection),
          conflictPolicy: (lww === true ? undefined : lww.conflictPolicy) ?? 'lww',
        }
        api.hook('cacheBeforeWriteItem', createLwwWriteHandler(handlerOptions))
        api.hook('cacheBeforeDeleteItem', createLwwDeleteHandler(handlerOptions))
      }
      if (options.formTextMerge ?? true) {
        api.hook('formFieldMerge', textFieldMerger)
      }
    },
  }
}
