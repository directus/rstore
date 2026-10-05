import type { Cache, CollectionDefaults, CustomCacheWriteMetadata, GlobalStoreType, HookDefinitions, StoreSchema } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { toRaw, unref } from 'vue'
import { ensureCollectionRef } from './context'

/** Payload of `cacheBeforeWriteItem`. */
type BeforeWritePayload = Parameters<HookDefinitions<StoreSchema, CollectionDefaults>['cacheBeforeWriteItem']>[0]

/**
 * Reusable `cacheBeforeWriteItem` dispatch state of one cache.
 *
 * `writeItems` publishes thousands of rows per call, so the payload and its
 * callbacks are allocated once per cache and refilled for every write. This is
 * safe because dispatch is synchronous and never re-entrant: writes requested
 * by a handler are queued until the current flush finishes. Handlers must not
 * keep the payload after returning.
 */
export interface WriteInterception {
  payload: BeforeWritePayload
  skipped: boolean
  value: Record<string, any> | undefined
  consumed: Set<string>
}

/** Create the reusable write dispatch state of a cache. */
function createWriteInterception(ctx: CacheRuntime): WriteInterception {
  const state = {
    skipped: false,
    value: undefined,
    consumed: new Set<string>(),
  } as WriteInterception
  // Every field is set up front so the object keeps one shape while refilled.
  state.payload = {
    store: ctx.getStore() as unknown as GlobalStoreType,
    meta: {},
    collection: undefined as unknown as BeforeWritePayload['collection'],
    key: '',
    existing: undefined,
    incoming: {},
    metadata: undefined,
    setValue: (value) => {
      state.value = value
    },
    skip: () => {
      state.skipped = true
    },
    consume: (...keys) => {
      for (const key of keys) {
        state.consumed.add(String(key))
      }
    },
  }
  return state
}

/**
 * Store hooks, resolved once: the store is a Proxy, and this runs per written item.
 */
function getHooks(ctx: CacheRuntime) {
  return ctx.hooks ??= ctx.getStore().$hooks
}

/**
 * Run `cacheBeforeWriteItem` handlers for one write.
 *
 * When no handler is registered, the hot write path neither reads the
 * committed row nor touches a payload (the unconsumed-metadata warning still
 * applies).
 *
 * @param ctx Cache runtime.
 * @param params Write parameters, including the opaque `metadata`.
 * @param collectionState Committed state of the written collection.
 * @param incoming Scalar fields of the write, relation fields split off.
 * @returns `false` when a handler dropped the write, the replacement row when
 * one was set, otherwise `undefined`.
 */
export function runBeforeWrite(
  ctx: CacheRuntime,
  params: Parameters<Cache['writeItem']>[0],
  collectionState: Record<string | number, any>,
  incoming: Record<string, any>,
): false | Record<string, any> | undefined {
  const hooks = getHooks(ctx)
  if (!hooks.hasHook('cacheBeforeWriteItem')) {
    if (params.metadata) {
      reportUnconsumedMetadata(ctx, params.collection.name, params.metadata, undefined)
    }
    return undefined
  }
  const state = ctx.writeInterception ??= createWriteInterception(ctx)
  state.skipped = false
  state.value = undefined
  if (state.consumed.size) {
    state.consumed.clear()
  }
  const payload = state.payload
  payload.meta = params.meta ?? {}
  payload.collection = params.collection
  payload.key = params.key
  // Raw read: handlers run inside the flush and must not track the row.
  payload.existing = unref(toRaw(collectionState)[params.key])
  payload.incoming = incoming
  payload.metadata = params.metadata
  hooks.callHookSync('cacheBeforeWriteItem', payload)
  if (params.metadata) {
    reportUnconsumedMetadata(ctx, params.collection.name, params.metadata, state.consumed)
  }
  return state.skipped ? false : state.value
}

/**
 * Run `cacheBeforeDeleteItem` handlers for one delete.
 *
 * @param ctx Cache runtime.
 * @param params Delete parameters, including the opaque `metadata`.
 * @returns Whether a handler kept the row.
 */
export function runBeforeDelete(
  ctx: CacheRuntime,
  params: Parameters<Cache['deleteItem']>[0],
): boolean {
  const hooks = getHooks(ctx)
  if (!hooks.hasHook('cacheBeforeDeleteItem')) {
    if (params.metadata) {
      reportUnconsumedMetadata(ctx, params.collection.name, params.metadata, undefined)
    }
    return false
  }
  let skipped = false
  let consumed: Set<string> | undefined
  hooks.callHookSync('cacheBeforeDeleteItem', {
    store: ctx.getStore(),
    meta: {},
    collection: params.collection,
    key: params.key,
    existing: unref(toRaw(ensureCollectionRef(ctx, params.collection.name).value)[params.key]),
    metadata: params.metadata,
    skip: () => {
      skipped = true
    },
    consume: (...keys) => {
      consumed ??= new Set()
      for (const key of keys) {
        consumed.add(String(key))
      }
    },
  })
  if (params.metadata) {
    reportUnconsumedMetadata(ctx, params.collection.name, params.metadata, consumed)
  }
  return skipped
}

/**
 * Warn once per metadata key that no handler consumed. Without this, an app
 * sending e.g. realtime stamps without the plugin that handles them would
 * silently degrade to plain overwrites.
 */
function reportUnconsumedMetadata(
  ctx: CacheRuntime,
  collectionName: string,
  metadata: CustomCacheWriteMetadata,
  consumed: Set<string> | undefined,
) {
  for (const key in metadata) {
    if ((metadata as Record<string, unknown>)[key] === undefined || consumed?.has(key)) {
      continue
    }
    ctx.warnOnce(key, `[rstore] cache write metadata "${key}" for collection "${collectionName}" was not handled by any plugin`)
  }
}
