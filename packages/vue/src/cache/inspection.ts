import type { CacheInspection, CacheInspectionLayer, CacheInspectionRow, ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { unref } from 'vue'
import { countEffectiveRows, readEffectiveRows } from './effectiveInspection'
import { resolveInspectionKey } from './inspectionKeys'

/** Count rows without allocating an unbounded array of cache addresses. */
function countRows(state: Record<string, unknown>): number {
  let count = 0
  for (const address in state) {
    if (Object.hasOwn(state, address)) {
      count++
    }
  }
  return count
}

/** Iterate stored values without fetching or allocating wrapped item proxies. */
function* readRows(collection: ResolvedCollection | undefined, state: Record<string, any>, keys?: ReadonlyMap<string, string | number>): Iterable<CacheInspectionRow> {
  for (const address in state) {
    if (!Object.hasOwn(state, address)) {
      continue
    }
    const value = unref(state[address])
    const key = keys?.get(address) ?? resolveInspectionKey(collection, address, value)
    yield { key, value }
  }
}

/** Read layers lazily, retaining their original deletion-key representation. */
function* readLayers(ctx: CacheRuntime): Iterable<CacheInspectionLayer> {
  for (const name in ctx.layers) {
    const collection = ctx.getStore().$collections.find(candidate => candidate.name === name)
    for (const layer of ctx.layers[name]!.value) {
      yield {
        id: layer.id,
        collectionName: layer.collectionName,
        optimistic: layer.optimistic ?? false,
        skip: layer.skip ?? false,
        prevent: { ...layer.prevent },
        rows: () => readRows(collection, layer.state),
        deletedKeys: () => layer.deletedItems.values(),
      }
    }
  }
}

/** Expose cache-owned diagnostics with borrowed values and live lazy readers. */
export function inspectCache(ctx: CacheRuntime): CacheInspection {
  // Existing rows resolve their scalar identity lazily when pulled. Only future
  // writes retain exact override-key forms after diagnostics explicitly opt in.
  ctx.publicKeys ??= new Map()
  return {
    collections: ctx.getStore().$collections.map(collection => ({
      name: collection.name,
      get count() {
        return countRows(ctx.state.collections[collection.name]?.value ?? {})
      },
      rows: () => readRows(collection, ctx.state.collections[collection.name]?.value ?? {}, ctx.publicKeys?.get(collection.name)),
      get effectiveCount() {
        return countEffectiveRows(ctx, collection.name)
      },
      effectiveRows: () => readEffectiveRows(ctx, collection),
    })),
    layers: () => readLayers(ctx),
    metadata: () => ({
      markers: ctx.state.markers,
      modules: Object.fromEntries(Object.entries(ctx.state.modules).map(([key, state]) => [key, unref(state)])),
      queryMeta: ctx.state.queryMeta,
      fieldTimestamps: ctx.state.fieldTimestamps,
      tombstones: {
        * [Symbol.iterator]() {
          for (const [, tombstone] of ctx.state.tombstones.entries()) {
            yield tombstone
          }
        },
      },
      paused: ctx.state.paused,
      queuedOperations: ctx.state.queue.length,
    }),
  }
}
