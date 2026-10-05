import type { ApplyMutationOptions, Cache, CacheTombstone, CustomCacheWriteMetadata, DeprecatedCacheMethods, FieldTimestamps, FieldTimestampValue, Plugin } from '@rstore/shared'
import type { CacheRuntime } from './types'
// Deprecated re-export of `@rstore/multiplayer/clock`, used by this file only.
import { compareHLC } from '@rstore/core'
import { createWarnOnce } from '@rstore/shared'

// Pre-0.9 LWW cache arguments and methods, mapped onto write metadata and onto
// the item metadata namespaces of `createMultiplayerPlugin()` (which this
// package cannot import). Every alias warns once per cache in dev builds.
// This file is deleted in 0.10.

/** Namespace of field stamps owned by `createMultiplayerPlugin()`. */
const FIELDS_NAMESPACE = 'multiplayer:fields'
/** Namespace of tombstones owned by `createMultiplayerPlugin()`. */
const TOMBSTONE_NAMESPACE = 'multiplayer:tombstone'
/** Name of the plugin `createMultiplayerPlugin()` returns. */
const MULTIPLAYER_PLUGIN_NAME = 'rstore-multiplayer'

/** Warn once that an alias is deprecated. */
function warnDeprecated(ctx: CacheRuntime, alias: string, replacement: string) {
  ctx.warnOnce(`deprecated:${alias}`, `[rstore] ${alias} is deprecated and removed in 0.10; use ${replacement} with createMultiplayerPlugin() from @rstore/multiplayer`)
}

/** Add a value to write metadata without mutating the caller's object. */
function withMetadata(metadata: CustomCacheWriteMetadata | undefined, key: 'fieldTimestamps' | 'deletedAt', value: unknown): CustomCacheWriteMetadata {
  return { ...metadata, [key]: value }
}

/** Map `cache.writeItem({ fieldTimestamps })` onto `metadata`. */
export function mapWriteItemAliases(ctx: CacheRuntime, params: Parameters<Cache['writeItem']>[0]): Parameters<Cache['writeItem']>[0] {
  if (params.fieldTimestamps === undefined) {
    return params
  }
  warnDeprecated(ctx, 'cache.writeItem({ fieldTimestamps })', 'metadata: { fieldTimestamps }')
  const { fieldTimestamps, ...rest } = params
  return { ...rest, metadata: withMetadata(params.metadata, 'fieldTimestamps', fieldTimestamps) }
}

/** Map `cache.deleteItem({ deletedAt })` onto `metadata`. */
export function mapDeleteItemAliases(ctx: CacheRuntime, params: Parameters<Cache['deleteItem']>[0]): Parameters<Cache['deleteItem']>[0] {
  if (params.deletedAt === undefined) {
    return params
  }
  warnDeprecated(ctx, 'cache.deleteItem({ deletedAt })', 'metadata: { deletedAt }')
  const { deletedAt, ...rest } = params
  return { ...rest, metadata: withMetadata(params.metadata, 'deletedAt', deletedAt) }
}

/** Write metadata of a mutation, including its deprecated `fieldTimestamps` / `deletedAt` options. */
export function resolveMutationMetadata(ctx: CacheRuntime, params: ApplyMutationOptions<any, any, any>): CustomCacheWriteMetadata | undefined {
  let metadata = params.metadata
  if (params.mutation !== 'delete' && params.fieldTimestamps !== undefined) {
    warnDeprecated(ctx, 'applyMutation({ fieldTimestamps })', 'metadata: { fieldTimestamps }')
    metadata = withMetadata(metadata, 'fieldTimestamps', params.fieldTimestamps)
  }
  if (params.mutation === 'delete' && params.deletedAt !== undefined) {
    warnDeprecated(ctx, 'applyMutation({ deletedAt })', 'metadata: { deletedAt }')
    metadata = withMetadata(metadata, 'deletedAt', params.deletedAt)
  }
  return metadata
}

/** Every tombstone of the multiplayer namespace. */
function readTombstones(cache: Cache): CacheTombstone[] {
  return Array.from(
    cache.itemMetadata.entries<{ deletedAt: FieldTimestampValue }>(TOMBSTONE_NAMESPACE),
    ({ collection, key, value }) => ({ collection, key, deletedAt: value.deletedAt }),
  )
}

/**
 * Create the deprecated LWW cache methods over the multiplayer namespaces.
 *
 * @param ctx Cache runtime, for warnings.
 * @param getCache The cache owning `itemMetadata`, resolved on use.
 */
export function createDeprecatedCacheMethods(ctx: CacheRuntime, getCache: () => Cache): DeprecatedCacheMethods {
  const warnTombstones = () => warnDeprecated(ctx, 'cache.tombstones', 'getTombstone(store, collection, key) and tombstoneEntries(store)')
  return {
    readFieldTimestamps({ collectionName, key }) {
      warnDeprecated(ctx, 'cache.readFieldTimestamps()', 'getFieldTimestamps(store, collection, key)')
      return getCache().itemMetadata.read<FieldTimestamps>(FIELDS_NAMESPACE, collectionName, key)
    },
    writeFieldTimestamps({ collectionName, key, timestamps }) {
      warnDeprecated(ctx, 'cache.writeFieldTimestamps()', 'setFieldTimestamps(store, collection, key, timestamps)')
      getCache().itemMetadata.write(FIELDS_NAMESPACE, collectionName, key, { ...timestamps })
    },
    tombstones: {
      get(collection, key) {
        warnTombstones()
        const stored = getCache().itemMetadata.read<{ deletedAt: FieldTimestampValue }>(TOMBSTONE_NAMESPACE, collection, key)
        return stored && { collection, key, deletedAt: stored.deletedAt }
      },
      entries() {
        warnTombstones()
        return readTombstones(getCache()).map(tombstone => [`${tombstone.collection}:${tombstone.key}`, tombstone] as [string, CacheTombstone]).values()
      },
      size() {
        warnTombstones()
        return getCache().itemMetadata.size(TOMBSTONE_NAMESPACE)
      },
    },
    gcTombstones(olderThan) {
      warnDeprecated(ctx, 'cache.gcTombstones()', 'gcTombstones(store, olderThan)')
      const cache = getCache()
      const dropped: Array<{ collection: string, key: string | number }> = []
      for (const { collection, key, deletedAt } of readTombstones(cache)) {
        if (compareHLC(deletedAt, olderThan) < 0) {
          cache.itemMetadata.delete(TOMBSTONE_NAMESPACE, collection, key)
          dropped.push({ collection, key })
        }
      }
      return dropped
    },
  }
}

/** Deprecated `createStore()` options. */
export interface DeprecatedStoreOptions {
  /**
   * Tombstone GC settings.
   *
   * @deprecated Pass `tombstoneGc` to `createMultiplayerPlugin()` from `@rstore/multiplayer`. Removed in 0.10.
   */
  tombstoneGc?: false | {
    intervalMs?: number
    ttlMs?: number
  }
}

/**
 * Apply the deprecated `createStore({ tombstoneGc })` option. The multiplayer
 * plugin reads it from `store.$deprecatedStoreOptions` when its own option is
 * unset; without the plugin it is ignored. Either way it warns once.
 *
 * @param store The store being created.
 * @param options The `createStore()` options.
 */
export function applyDeprecatedStoreOptions(store: object, options: DeprecatedStoreOptions & { plugins?: Plugin[] }): void {
  if (options.tombstoneGc === undefined) {
    return
  }
  const hasPlugin = options.plugins?.some(plugin => plugin.name === MULTIPLAYER_PLUGIN_NAME) ?? false
  createWarnOnce()('tombstoneGc', hasPlugin
    ? '[rstore] createStore({ tombstoneGc }) is deprecated and removed in 0.10; pass it to createMultiplayerPlugin({ tombstoneGc })'
    : '[rstore] createStore({ tombstoneGc }) is ignored: tombstones are kept by createMultiplayerPlugin() from @rstore/multiplayer, which takes this option')
  if (hasPlugin) {
    Object.defineProperty(store, '$deprecatedStoreOptions', { value: { tombstoneGc: options.tombstoneGc } })
  }
}
