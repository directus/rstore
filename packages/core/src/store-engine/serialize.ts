import type { CustomCacheState } from '@rstore/shared'
import type { EngineContext } from './types.js'
import { updateItemIndexes } from './resolve.js'

/**
 * Serialize the cache to a plain JSON-safe snapshot for SSR transfer.
 *
 * Only the canonical `base` items are emitted (never layer-merged values), so
 * optimistic state does not leak into the hydrated payload. Empty collection
 * entries are preserved so a cleared collection still round-trips.
 */
export function getState(ctx: EngineContext): CustomCacheState {
  const result: CustomCacheState = {
    collections: {},
    markers: { ...ctx.markers },
    modules: {},
    queryMeta: ctx.queryMeta,
  }

  for (const [collectionName, collectionState] of ctx.collections) {
    const target: Record<string | number, any> = result.collections[collectionName] = {}
    for (const [key, item] of collectionState.base) {
      if (item) {
        target[key] = item
      }
    }
  }

  for (const [moduleKey, mod] of ctx.modules) {
    result.modules[moduleKey] = mod.value
  }

  return result
}

/**
 * Replace a module holder's contents in place so any reactive wrapper the
 * bridge created over it keeps observing the same object reference.
 */
function replaceModuleContents(target: any, source: any): void {
  if (!(target && typeof target === 'object' && source && typeof source === 'object')) {
    return
  }
  // Arrays must be truncated in place: deleting indices leaves stale `length`
  // and empty holes (`[9, <2 empty>]`), corrupting the array. Reset length and
  // re-fill from the source when it is also an array (an empty/object source —
  // e.g. `clear()` passing `{}` — just empties the array).
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

/**
 * Hydrate the cache from a snapshot. Rebuilds base items and relation indexes
 * per collection; module holders are mutated in place to preserve reactive
 * bridge wrappers. Fires the reset callback so the bridge can drop wrapped
 * items and re-track signals.
 */
export function setStateNow(ctx: EngineContext, value: CustomCacheState): void {
  ctx.markers = value.markers || {}

  // Reset base + indexes for every known collection (layers are preserved).
  for (const [collectionName, collectionState] of ctx.collections) {
    collectionState.base.clear()
    collectionState.indexes.clear()
    ctx.observers.touchList(collectionName)
  }

  for (const collectionName in value.collections) {
    const collection = ctx.callbacks.getCollection(collectionName)
    if (!collection) {
      continue
    }
    const collectionState = ctx.ensureCollection(collectionName)
    const incoming = value.collections[collectionName as keyof typeof value.collections] as Record<string | number, any>
    for (const rawKey in incoming) {
      const item = incoming[rawKey]
      if (item) {
        // Object keys are always strings; recover the canonical (possibly
        // numeric) key from the item so it matches direct-write storage.
        const derived = collection.getKey(item)
        const key = derived != null ? derived : rawKey
        collectionState.base.set(key, item)
        updateItemIndexes(ctx, collection, key, undefined, item)
      }
    }
    ctx.observers.touchList(collectionName)
  }

  // Modules: keep existing holders so reactive wrappers stay valid; mutate in
  // place. Holders absent from the incoming state are emptied.
  for (const [moduleKey, mod] of ctx.modules) {
    if (!(moduleKey in (value.modules ?? {}))) {
      replaceModuleContents(mod.value, {})
    }
  }
  for (const moduleKey in value.modules) {
    const incoming = value.modules[moduleKey]
    const existing = ctx.modules.get(moduleKey)
    if (existing) {
      replaceModuleContents(existing.value, incoming)
    }
    else {
      ctx.modules.set(moduleKey, { value: incoming })
    }
  }

  ctx.callbacks.onReset?.()

  ctx.queryMeta = value.queryMeta || {}
}

/**
 * Reset the cache to empty: clears markers, every collection's base + indexes,
 * field timestamps and tombstones, and empties module holders in place. Layers
 * are left untouched (matching the previous behaviour).
 */
export function clearNow(ctx: EngineContext): void {
  ctx.markers = {}

  for (const [collectionName, collectionState] of ctx.collections) {
    collectionState.base.clear()
    collectionState.indexes.clear()
    ctx.observers.touchList(collectionName)
  }

  for (const [, mod] of ctx.modules) {
    replaceModuleContents(mod.value, {})
  }

  ctx.fieldTimestamps.clear()

  // Drop every tombstone (snapshot the entries first to avoid mutating during
  // iteration).
  const tombs = Array.from(ctx.tombstones.entries(), ([, t]) => t)
  for (const t of tombs) {
    ctx.tombstones.clear(t.collection, t.key)
  }

  ctx.callbacks.onReset?.()
}
