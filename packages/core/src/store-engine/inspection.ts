import type { CacheInspection, CacheInspectionCollection, CacheInspectionLayer, CacheInspectionRow, CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { EngineCollectionState, EngineContext, KeyId } from './internal-types.js'
import { mergeInspectionValues, resolveInspectionKey } from './inspection-merge.js'
import { serializeModules } from './modules.js'

/**
 * Report a row address in its public form without application key callbacks
 * or accessors: a recorded key form first, then a matching data identity.
 */
function getInspectionKey(state: EngineCollectionState, id: KeyId, values: unknown[]): string | number {
  const override = state.keyOverrides?.get(id)
  if (override !== undefined)
    return override
  for (let index = values.length - 1; index >= 0; index--) {
    const key = resolveInspectionKey(id, values[index])
    if (key !== id)
      return key
  }
  return id
}

/** Iterate committed base rows lazily, without resolving overlays. */
function* readBaseRows(state: EngineCollectionState | undefined): Iterable<CacheInspectionRow> {
  if (!state) {
    return
  }
  for (const [id, value] of state.base) {
    yield { key: getInspectionKey(state, id, [value]), value }
  }
}

/**
 * Active public layers, read live: diagnostics follow borrowed layer flags,
 * patches, and deletions even when the engine resolves their add-time copy.
 */
function getActiveLayers(state: EngineCollectionState): CacheLayer[] {
  const layers: CacheLayer[] = []
  for (const { layer } of state.layers) {
    if (!layer.skip)
      layers.push(layer)
  }
  return layers
}

/** Match deletion keys in either their string or numeric representation. */
function isDeleted(layers: CacheLayer[], id: KeyId): boolean {
  const numeric = Number(id)
  const numericForm = String(numeric) === id
  return layers.some(layer => layer.deletedItems.has(id) || (numericForm && layer.deletedItems.has(numeric)))
}

/** Visible addresses: base write order, then rows first added by each layer. */
function getEffectiveIds(state: EngineCollectionState, layers: CacheLayer[]): KeyId[] {
  const ids = new Set<KeyId>(state.base.keys())
  for (const layer of layers) {
    for (const address in layer.state) {
      if (Object.hasOwn(layer.state, address))
        ids.add(address)
    }
  }
  return Array.from(ids).filter(id => !isDeleted(layers, id))
}

/**
 * Iterate visible rows, merging overlays only for consumed rows. A row without
 * an active patch is yielded as its borrowed base value.
 */
function* readEffectiveRows(state: EngineCollectionState | undefined): Iterable<CacheInspectionRow> {
  if (!state) {
    return
  }
  const layers = getActiveLayers(state)
  for (const id of getEffectiveIds(state, layers)) {
    const values: unknown[] = state.base.has(id) ? [state.base.get(id)] : []
    let topLayer: CacheLayer | undefined
    for (const layer of layers) {
      if (Object.hasOwn(layer.state, id)) {
        values.push(layer.state[id])
        topLayer = layer
      }
    }
    const key = getInspectionKey(state, id, values)
    if (!topLayer) {
      yield { key, value: values[0] }
      continue
    }
    const merged = mergeInspectionValues(values, topLayer)
    yield { key, value: merged.value, ...(merged.truncated ? { truncated: true } : {}) }
  }
}

/** Read every installed layer, skipped ones included, with its public key forms. */
function* readLayers(ctx: EngineContext): Iterable<CacheInspectionLayer> {
  for (const state of ctx.collections.values()) {
    for (const { layer } of state.layers) {
      yield {
        id: layer.id,
        collectionName: layer.collectionName,
        optimistic: layer.optimistic ?? false,
        skip: layer.skip ?? false,
        prevent: { ...layer.prevent },
        rows: () => readLayerRows(layer.state),
        deletedKeys: () => layer.deletedItems.values(),
      }
    }
  }
}

/** Iterate borrowed layer patches in their supplied representation. */
function* readLayerRows(state: Record<string, any>): Iterable<CacheInspectionRow> {
  for (const address in state) {
    if (Object.hasOwn(state, address)) {
      yield { key: resolveInspectionKey(address, state[address]), value: state[address] }
    }
  }
}

/** Expose engine-owned diagnostics with borrowed values and live lazy readers. */
export function inspectEngine(ctx: EngineContext, collections: readonly ResolvedCollection<any, any, any>[]): CacheInspection {
  return {
    collections: collections.map((collection): CacheInspectionCollection => ({
      name: collection.name,
      get count() {
        return ctx.collections.get(collection.name)?.base.size ?? 0
      },
      rows: () => readBaseRows(ctx.collections.get(collection.name)),
      get effectiveCount() {
        const state = ctx.collections.get(collection.name)
        return state ? getEffectiveIds(state, getActiveLayers(state)).length : 0
      },
      effectiveRows: () => readEffectiveRows(ctx.collections.get(collection.name)),
    })),
    layers: () => readLayers(ctx),
    metadata: () => ({
      markers: ctx.markers,
      modules: serializeModules(ctx),
      queryMeta: ctx.queryMeta,
      fieldTimestamps: ctx.fieldTimestamps,
      tombstones: {
        * [Symbol.iterator]() {
          for (const [, tombstone] of ctx.tombstones.entries()) {
            yield tombstone
          }
        },
      },
      paused: ctx.pauseDepth > 0,
      queuedOperations: ctx.queue.length - ctx.queueHead,
    }),
  }
}
