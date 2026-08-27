import type { MutableEngineChangeSet } from './change-set.js'
import type { KeyId, ObserverRegistry } from './internal-types.js'
import type { ObserverCallback, Unsubscribe } from './types.js'
import { getIndexDependencyId, touchItem, touchList } from './change-set.js'
import { toKeyId } from './identity.js'

/** Invoke callbacks independently so one failure cannot starve other readers. */
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

/** Create subscription-owned item, list, and index observer registries. */
export function createObserverRegistry(): ObserverRegistry {
  const itemObservers = new Map<string, Map<KeyId, Set<ObserverCallback>>>()
  const listObservers = new Map<string, Set<ObserverCallback>>()
  const indexObservers = new Map<string, Set<ObserverCallback>>()
  const indexDependenciesByCollection = new Map<string, Set<string>>()
  let disposed = false

  /** Subscribe to one item identity. */
  function observeItem(collection: string, key: string | number, callback: ObserverCallback): Unsubscribe {
    if (disposed)
      return noop
    const id = toKeyId(key)
    const byKey = itemObservers.get(collection) ?? new Map<KeyId, Set<ObserverCallback>>()
    itemObservers.set(collection, byKey)
    const callbacks = byKey.get(id) ?? new Set<ObserverCallback>()
    byKey.set(id, callbacks)
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (!callbacks.size)
        byKey.delete(id)
      if (!byKey.size)
        itemObservers.delete(collection)
    }
  }

  /** Subscribe to one visible collection membership. */
  function observeList(collection: string, callback: ObserverCallback): Unsubscribe {
    if (disposed)
      return noop
    const callbacks = listObservers.get(collection) ?? new Set<ObserverCallback>()
    listObservers.set(collection, callbacks)
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (!callbacks.size)
        listObservers.delete(collection)
    }
  }

  /** Subscribe to one already-encoded index membership. */
  function observeIndex(collection: string, indexKey: string, indexValueId: string, callback: ObserverCallback): Unsubscribe {
    if (disposed)
      return noop
    const dependency = getIndexDependencyId(collection, indexKey, indexValueId)
    const callbacks = indexObservers.get(dependency) ?? new Set<ObserverCallback>()
    indexObservers.set(dependency, callbacks)
    callbacks.add(callback)
    const dependencies = indexDependenciesByCollection.get(collection) ?? new Set<string>()
    indexDependenciesByCollection.set(collection, dependencies)
    dependencies.add(dependency)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size)
        return
      indexObservers.delete(dependency)
      dependencies.delete(dependency)
      if (!dependencies.size)
        indexDependenciesByCollection.delete(collection)
    }
  }

  /** Add every directly observed scope when a collection is replaced. */
  function collectCollection(changes: MutableEngineChangeSet, collection: string): void {
    if (disposed)
      return
    for (const id of itemObservers.get(collection)?.keys() ?? []) touchItem(changes, collection, id)
    touchList(changes, collection)
    for (const dependency of indexDependenciesByCollection.get(collection) ?? []) changes.indexes.add(dependency)
  }

  /** Dispatch one immutable completed journal to direct observers. */
  function dispatch(changes: MutableEngineChangeSet): void {
    if (disposed)
      return
    for (const [collection, keys] of changes.items) {
      const byKey = itemObservers.get(collection)
      for (const key of keys) runAll(byKey?.get(key))
    }
    for (const collection of changes.lists) runAll(listObservers.get(collection))
    for (const dependency of changes.indexes) runAll(indexObservers.get(dependency))
  }

  /** Release every observer owned by this registry. */
  function dispose(): void {
    disposed = true
    itemObservers.clear()
    listObservers.clear()
    indexObservers.clear()
    indexDependenciesByCollection.clear()
  }

  return { observeItem, observeList, observeIndex, collectCollection, dispatch, dispose }
}

/** Reusable disposed subscription handle. */
function noop(): void {}
