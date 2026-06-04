import type { ObserverCallback, ObserverRegistry, Unsubscribe } from './types.js'

/** Pending change accumulator, deduped per scope until the next flush. */
interface PendingChange {
  items: Map<string, Set<string | number>>
  lists: Set<string>
  indexes: Map<string, Map<string, Set<string>>>
}

/**
 * Create the fine-grained observer registry.
 *
 * Three independent registries track per-item, per-list (collection) and
 * per-index-bucket subscriptions. Mutating code records touched scopes via
 * `touch*`; {@link ObserverRegistry.flush} then invokes each matching
 * callback exactly once and clears the accumulated change.
 *
 * Callbacks run synchronously inside a try/catch so one faulty subscriber
 * can't break the notification fan-out for the others.
 */
export function createObserverRegistry(): ObserverRegistry {
  // collection -> key -> callbacks
  const itemObservers = new Map<string, Map<string | number, Set<ObserverCallback>>>()
  // collection -> callbacks
  const listObservers = new Map<string, Set<ObserverCallback>>()
  // collection -> indexKey -> indexValue -> callbacks
  const indexObservers = new Map<string, Map<string, Map<string, Set<ObserverCallback>>>>()

  let change = createPending()

  function createPending(): PendingChange {
    return {
      items: new Map(),
      lists: new Set(),
      indexes: new Map(),
    }
  }

  function observeItem(collection: string, key: string | number, cb: ObserverCallback): Unsubscribe {
    let byKey = itemObservers.get(collection)
    if (!byKey) {
      byKey = new Map()
      itemObservers.set(collection, byKey)
    }
    let set = byKey.get(key)
    if (!set) {
      set = new Set()
      byKey.set(key, set)
    }
    set.add(cb)
    return () => {
      set!.delete(cb)
      if (set!.size === 0) {
        byKey!.delete(key)
      }
    }
  }

  function observeList(collection: string, cb: ObserverCallback): Unsubscribe {
    let set = listObservers.get(collection)
    if (!set) {
      set = new Set()
      listObservers.set(collection, set)
    }
    set.add(cb)
    return () => {
      set!.delete(cb)
    }
  }

  function observeIndex(collection: string, indexKey: string, indexValue: string, cb: ObserverCallback): Unsubscribe {
    let byIndexKey = indexObservers.get(collection)
    if (!byIndexKey) {
      byIndexKey = new Map()
      indexObservers.set(collection, byIndexKey)
    }
    let byValue = byIndexKey.get(indexKey)
    if (!byValue) {
      byValue = new Map()
      byIndexKey.set(indexKey, byValue)
    }
    let set = byValue.get(indexValue)
    if (!set) {
      set = new Set()
      byValue.set(indexValue, set)
    }
    set.add(cb)
    return () => {
      set!.delete(cb)
      if (set!.size === 0) {
        byValue!.delete(indexValue)
      }
    }
  }

  function touchItem(collection: string, key: string | number): void {
    let set = change.items.get(collection)
    if (!set) {
      set = new Set()
      change.items.set(collection, set)
    }
    set.add(key)
  }

  function touchList(collection: string): void {
    change.lists.add(collection)
  }

  function touchIndex(collection: string, indexKey: string, indexValue: string): void {
    let byIndexKey = change.indexes.get(collection)
    if (!byIndexKey) {
      byIndexKey = new Map()
      change.indexes.set(collection, byIndexKey)
    }
    let values = byIndexKey.get(indexKey)
    if (!values) {
      values = new Set()
      byIndexKey.set(indexKey, values)
    }
    values.add(indexValue)
  }

  /** Invoke a set of callbacks, isolating failures. */
  function runAll(callbacks: Set<ObserverCallback> | undefined): void {
    if (!callbacks || callbacks.size === 0) {
      return
    }
    // Copy so observers can (un)subscribe during notification.
    for (const cb of [...callbacks]) {
      try {
        cb()
      }
      catch (error) {
        console.error('[rstore] observer callback failed', error)
      }
    }
  }

  function flush(): void {
    if (change.items.size === 0 && change.lists.size === 0 && change.indexes.size === 0) {
      return
    }
    const flushing = change
    change = createPending()

    for (const [collection, keys] of flushing.items) {
      const byKey = itemObservers.get(collection)
      if (byKey) {
        for (const key of keys) {
          runAll(byKey.get(key))
        }
      }
    }
    for (const collection of flushing.lists) {
      runAll(listObservers.get(collection))
    }
    for (const [collection, byIndexKey] of flushing.indexes) {
      const obsByIndexKey = indexObservers.get(collection)
      if (obsByIndexKey) {
        for (const [indexKey, values] of byIndexKey) {
          const obsByValue = obsByIndexKey.get(indexKey)
          if (obsByValue) {
            for (const value of values) {
              runAll(obsByValue.get(value))
            }
          }
        }
      }
    }
  }

  return {
    observeItem,
    observeList,
    observeIndex,
    touchItem,
    touchList,
    touchIndex,
    flush,
  }
}
