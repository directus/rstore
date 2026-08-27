import type { CustomCacheState, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext } from './types.js'
import { getPublicKey, isEntityKey, registerKey, restoreLayerKeyValues } from './identity.js'
import { rebuildIndexes } from './indexes.js'

/** Serialize base data only; optimistic layers never cross the SSR boundary. */
export function getState(ctx: EngineContext): CustomCacheState {
  const result: CustomCacheState = {
    collections: {},
    markers: { ...ctx.markers },
    modules: {},
    queryMeta: ctx.queryMeta,
  }
  for (const [name, state] of ctx.collections) {
    const target: Record<string | number, any> = result.collections[name] = {}
    for (const [id, item] of state.base) {
      if (item) {
        target[getPublicKey(state, id)] = item
      }
    }
  }
  for (const [key, module] of ctx.modules) {
    result.modules[key] = module.value
  }
  return result
}

/** Replace query metadata in place so bridge references stay live. */
function replaceQueryMeta(ctx: EngineContext, source: Record<string, any> | undefined): void {
  if (source === ctx.queryMeta) {
    return
  }
  for (const key of Object.keys(ctx.queryMeta)) {
    delete ctx.queryMeta[key]
  }
  Object.assign(ctx.queryMeta, source ?? {})
}

/** Replace a module object or array without changing its identity. */
function replaceModuleContents(target: any, source: any): void {
  if (target === source || !(target && typeof target === 'object' && source && typeof source === 'object')) {
    return
  }
  if (Array.isArray(target)) {
    target.length = 0
    if (Array.isArray(source)) {
      target.push(...source)
    }
    return
  }
  for (const key of Object.keys(target)) {
    delete target[key]
  }
  Object.assign(target, source)
}

/** Clear base/view storage while retaining installed optimistic layers. */
function resetCollectionState(state: EngineCollectionState): void {
  state.base.clear()
  state.keyValues.clear()
  state.indexes.clear()
  state.resolvedItems.clear()
  state.visibleKeys = undefined
  state.visibleKeyValues = undefined
}

/** Restore snapshot base items using collection-derived key representation. */
function restoreCollection(
  state: EngineCollectionState,
  collection: ResolvedCollection<any, any, any>,
  incoming: Record<string | number, any> | undefined,
): void {
  if (incoming) {
    for (const rawKey of Object.keys(incoming)) {
      const item = incoming[rawKey]
      if (!item) {
        continue
      }
      const derived = collection.getKey(item)
      const key = isEntityKey(derived) ? derived : rawKey
      const id = registerKey(state, collection, key, item)
      state.base.set(id, item)
    }
  }
  restoreLayerKeyValues(state)
}

/** Rebuild every named collection, then invalidate all of its subscribers. */
function resetCollections(ctx: EngineContext, incoming: CustomCacheState['collections']): void {
  const names = new Set([...ctx.collections.keys(), ...Object.keys(incoming ?? {})])
  for (const name of names) {
    const collection = ctx.callbacks.getCollection(name)
    const state = ctx.collections.get(name) ?? (collection ? ctx.ensureCollection(name) : undefined)
    if (!state) {
      continue
    }
    resetCollectionState(state)
    if (collection) {
      restoreCollection(state, collection, incoming?.[name as keyof typeof incoming] as Record<string | number, any> | undefined)
      rebuildIndexes(ctx, collection)
    }
    ctx.observers.invalidateCollection(name)
  }
}

/** Hydrate a cache snapshot while preserving active layers and module identity. */
export function setStateNow(ctx: EngineContext, value: CustomCacheState): void {
  ctx.markers = value.markers || {}
  ctx.fieldTimestamps.clear()
  resetCollections(ctx, value.collections)

  for (const [key, module] of ctx.modules) {
    if (!(key in (value.modules ?? {}))) {
      replaceModuleContents(module.value, {})
    }
  }
  for (const key of Object.keys(value.modules)) {
    const incoming = value.modules[key]
    const existing = ctx.modules.get(key)
    if (existing) {
      replaceModuleContents(existing.value, incoming)
    }
    else {
      ctx.modules.set(key, { value: ctx.callbacks.wrapModuleState?.(incoming) ?? incoming })
    }
  }

  replaceQueryMeta(ctx, value.queryMeta)
  ctx.callbacks.onReset?.()
}

/** Clear base state while leaving installed optimistic layers visible. */
export function clearNow(ctx: EngineContext): void {
  ctx.markers = {}
  ctx.fieldTimestamps.clear()
  resetCollections(ctx, {})

  for (const [, module] of ctx.modules) {
    replaceModuleContents(module.value, {})
  }
  for (const [, tombstone] of Array.from(ctx.tombstones.entries())) {
    ctx.tombstones.clear(tombstone.collection, tombstone.key)
  }

  replaceQueryMeta(ctx, {})
  ctx.callbacks.onReset?.()
}
