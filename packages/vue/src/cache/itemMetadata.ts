import type { CacheItemMetadata, CacheItemMetadataEntry, CacheItemMetadataNamespaceOptions, CustomCacheState, SerializedCacheItemMetadata } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { resolveHydratedKey } from './hydration'

/** One stored entry. The original key is kept so `entries()` can return its type. */
interface StoredEntry {
  key: string | number
  value: unknown
}

/** Entries of one namespace: collection name → normalized key → entry. */
type NamespaceEntries = Map<string, Map<string, StoredEntry>>

/** Non-reactive item metadata owned by the Vue cache. */
export interface ItemMetadataState {
  /** Registered namespaces and their resolved options. */
  namespaces: Map<string, Required<CacheItemMetadataNamespaceOptions>>
  /** Entries by namespace. */
  entries: Map<string, NamespaceEntries>
}

/** Create empty item metadata state. */
export function createItemMetadataState(): ItemMetadataState {
  return { namespaces: new Map(), entries: new Map() }
}

/**
 * Normalize an item key the way cache rows are addressed: rows live in plain
 * objects, so `1` and `'1'` are the same row and must share metadata.
 */
function normalizeKey(key: string | number): string {
  return String(key)
}

/** Create the public `cache.itemMetadata` API over the runtime state. */
export function createItemMetadataApi(ctx: CacheRuntime): CacheItemMetadata {
  const state = ctx.state.itemMetadata
  return {
    register(namespace, options) {
      const resolved = { lifecycle: options.lifecycle, serialize: options.serialize ?? true, persist: options.persist ?? false }
      const current = state.namespaces.get(namespace)
      if (current) {
        if (current.lifecycle !== resolved.lifecycle || current.serialize !== resolved.serialize || current.persist !== resolved.persist) {
          throw new Error(`[rstore] Item metadata namespace "${namespace}" is already registered with different options`)
        }
        return
      }
      state.namespaces.set(namespace, resolved)
    },
    read(namespace, collection, key) {
      return state.entries.get(namespace)?.get(collection)?.get(normalizeKey(key))?.value as any
    },
    write(namespace, collection, key, value) {
      if (!state.namespaces.has(namespace)) {
        throw new Error(`[rstore] Item metadata namespace "${namespace}" is not registered`)
      }
      writeEntry(state, namespace, collection, key, value)
    },
    delete(namespace, collection, key) {
      const keys = state.entries.get(namespace)?.get(collection)
      keys?.delete(normalizeKey(key))
      if (keys?.size === 0) {
        state.entries.get(namespace)!.delete(collection)
      }
    },
    entries: (namespace, collection) => iterateEntries(state, namespace, collection) as any,
    namespaces: () => Array.from(state.namespaces, ([name, options]) => ({ name, ...options })),
    size(namespace) {
      let size = 0
      for (const keys of state.entries.get(namespace)?.values() ?? []) {
        size += keys.size
      }
      return size
    },
  }
}

/** Store one entry, creating the intermediate maps. */
function writeEntry(state: ItemMetadataState, namespace: string, collection: string, key: string | number, value: unknown) {
  let collections = state.entries.get(namespace)
  if (!collections) {
    collections = new Map()
    state.entries.set(namespace, collections)
  }
  let keys = collections.get(collection)
  if (!keys) {
    keys = new Map()
    collections.set(collection, keys)
  }
  keys.set(normalizeKey(key), { key, value })
}

/** Yield the entries of one namespace, optionally of one collection. */
function* iterateEntries(state: ItemMetadataState, namespace: string, collection?: string): IterableIterator<CacheItemMetadataEntry> {
  const collections = state.entries.get(namespace)
  if (!collections) {
    return
  }
  for (const [collectionName, keys] of collections) {
    if (collection != null && collection !== collectionName) {
      continue
    }
    for (const { key, value } of keys.values()) {
      yield { collection: collectionName, key, value }
    }
  }
}

/** Drop the `item`-lifecycle entries of a deleted or evicted row. */
export function removeItemMetadataForItem(ctx: CacheRuntime, collection: string, key: string | number) {
  const state = ctx.state.itemMetadata
  if (!state.entries.size) {
    return
  }
  const normalizedKey = normalizeKey(key)
  for (const [namespace, collections] of state.entries) {
    if (state.namespaces.get(namespace)?.lifecycle === 'item') {
      collections.get(collection)?.delete(normalizedKey)
    }
  }
}

/** Drop every entry of one collection, whatever its lifecycle (`clearCollection`). */
export function clearItemMetadataForCollection(ctx: CacheRuntime, collection: string) {
  for (const collections of ctx.state.itemMetadata.entries.values()) {
    collections.delete(collection)
  }
}

/** Drop every entry, keeping namespace registrations (`clear`, `setState`). */
export function clearItemMetadata(ctx: CacheRuntime) {
  ctx.state.itemMetadata.entries.clear()
}

/** Serialize the namespaces registered with `serialize`, or `undefined` when there is nothing to send. */
export function serializeItemMetadata(ctx: CacheRuntime): SerializedCacheItemMetadata | undefined {
  const state = ctx.state.itemMetadata
  let result: SerializedCacheItemMetadata | undefined
  for (const [namespace, collections] of state.entries) {
    if (!state.namespaces.get(namespace)?.serialize) {
      continue
    }
    for (const [collection, keys] of collections) {
      if (!keys.size) {
        continue
      }
      const target: Record<string | number, unknown> = ((result ??= {})[namespace] ??= {})[collection] = {}
      for (const [key, entry] of keys) {
        target[key] = entry.value
      }
    }
  }
  return result
}

/**
 * Replace every entry with the serialized namespaces of a `getState()` payload.
 * Namespaces that are not registered (or not serialized) here are ignored.
 */
export function restoreItemMetadata(ctx: CacheRuntime, value: CustomCacheState) {
  clearItemMetadata(ctx)
  const state = ctx.state.itemMetadata
  for (const namespace in value.itemMetadata) {
    if (!state.namespaces.get(namespace)?.serialize) {
      continue
    }
    const collections = value.itemMetadata[namespace]!
    for (const collectionName in collections) {
      const keys = collections[collectionName]!
      for (const key in keys) {
        writeEntry(state, namespace, collectionName, resolveHydratedKey(ctx, value, collectionName, key), keys[key])
      }
    }
  }
}
