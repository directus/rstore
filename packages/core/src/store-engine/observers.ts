import type { KeyId, ObserverRegistry } from './internal-types.js'
import type { ObserverChanges } from './observer-changes.js'
import type { ObserverCallback, Unsubscribe } from './types.js'
import { toKeyId } from './identity.js'

/** Pending observer invalidations, deduplicated until the next queue flush. */
interface PendingChange {
  items: Map<string, Set<KeyId>>
  lists: Set<string>
  indexes: Map<string, Map<string, Set<string>>>
}

/** Create an empty pending-change accumulator. */
function createPending(): PendingChange {
  return { items: new Map(), lists: new Set(), indexes: new Map() }
}

/** Invoke callbacks independently so one failure cannot block other readers. */
function runAll(callbacks: Set<ObserverCallback> | undefined): void {
  for (const callback of callbacks ? [...callbacks] : []) {
    try {
      callback()
    }
    catch (error) {
      console.error('[rstore] observer callback failed', error)
    }
  }
}

/** Create fine-grained item, list and index observer registries. */
export function createObserverRegistry(onFlush?: (changes: ObserverChanges) => void): ObserverRegistry {
  const itemObservers = new Map<string, Map<KeyId, Set<ObserverCallback>>>()
  const listObservers = new Map<string, Set<ObserverCallback>>()
  const indexObservers = new Map<string, Map<string, Map<string, Set<ObserverCallback>>>>()
  let pending = createPending()
  let disposed = false

  function observeItem(collection: string, key: string | number, callback: ObserverCallback): Unsubscribe {
    if (disposed) {
      return () => {}
    }
    const id = toKeyId(key)
    const byKey = itemObservers.get(collection) ?? new Map<KeyId, Set<ObserverCallback>>()
    itemObservers.set(collection, byKey)
    const callbacks = byKey.get(id) ?? new Set<ObserverCallback>()
    byKey.set(id, callbacks)
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        byKey.delete(id)
      }
      if (byKey.size === 0) {
        itemObservers.delete(collection)
      }
    }
  }

  function observeList(collection: string, callback: ObserverCallback): Unsubscribe {
    if (disposed) {
      return () => {}
    }
    const callbacks = listObservers.get(collection) ?? new Set<ObserverCallback>()
    listObservers.set(collection, callbacks)
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        listObservers.delete(collection)
      }
    }
  }

  function observeIndex(collection: string, indexKey: string, indexValue: string, callback: ObserverCallback): Unsubscribe {
    if (disposed) {
      return () => {}
    }
    const byIndex = indexObservers.get(collection) ?? new Map<string, Map<string, Set<ObserverCallback>>>()
    indexObservers.set(collection, byIndex)
    const byValue = byIndex.get(indexKey) ?? new Map<string, Set<ObserverCallback>>()
    byIndex.set(indexKey, byValue)
    const callbacks = byValue.get(indexValue) ?? new Set<ObserverCallback>()
    byValue.set(indexValue, callbacks)
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        byValue.delete(indexValue)
      }
      if (byValue.size === 0) {
        byIndex.delete(indexKey)
      }
      if (byIndex.size === 0) {
        indexObservers.delete(collection)
      }
    }
  }

  function touchItem(collection: string, key: string | number): void {
    if (disposed) {
      return
    }
    const keys = pending.items.get(collection) ?? new Set<KeyId>()
    pending.items.set(collection, keys)
    keys.add(toKeyId(key))
  }

  function touchList(collection: string): void {
    if (disposed) {
      return
    }
    pending.lists.add(collection)
  }

  function touchIndex(collection: string, indexKey: string, indexValue: string): void {
    if (disposed) {
      return
    }
    const byIndex = pending.indexes.get(collection) ?? new Map<string, Set<string>>()
    pending.indexes.set(collection, byIndex)
    const values = byIndex.get(indexKey) ?? new Set<string>()
    byIndex.set(indexKey, values)
    values.add(indexValue)
  }

  function invalidateCollection(collection: string): void {
    if (disposed) {
      return
    }
    for (const key of itemObservers.get(collection)?.keys() ?? []) {
      touchItem(collection, key)
    }
    touchList(collection)
    for (const [indexKey, byValue] of indexObservers.get(collection) ?? []) {
      for (const indexValue of byValue.keys()) {
        touchIndex(collection, indexKey, indexValue)
      }
    }
  }

  function flush(): void {
    if (disposed) {
      pending = createPending()
      return
    }
    if (pending.items.size === 0 && pending.lists.size === 0 && pending.indexes.size === 0) {
      return
    }
    const change = pending
    pending = createPending()
    let bridgeError: unknown
    let bridgeFailed = false
    try {
      onFlush?.(change)
    }
    catch (error) {
      // Framework bridge failures must not starve direct engine observers.
      bridgeError = error
      bridgeFailed = true
    }
    for (const [collection, keys] of change.items) {
      const byKey = itemObservers.get(collection)
      for (const key of keys) {
        runAll(byKey?.get(key))
      }
    }
    for (const collection of change.lists) {
      runAll(listObservers.get(collection))
    }
    for (const [collection, byIndex] of change.indexes) {
      const observedIndexes = indexObservers.get(collection)
      for (const [indexKey, values] of byIndex) {
        const observedValues = observedIndexes?.get(indexKey)
        for (const value of values) {
          runAll(observedValues?.get(value))
        }
      }
    }
    if (bridgeFailed) {
      throw bridgeError
    }
  }

  /** Release every observer and pending change owned by this registry. */
  function dispose(): void {
    disposed = true
    itemObservers.clear()
    listObservers.clear()
    indexObservers.clear()
    pending = createPending()
  }

  return { observeItem, observeList, observeIndex, touchItem, touchList, touchIndex, invalidateCollection, flush, dispose }
}
