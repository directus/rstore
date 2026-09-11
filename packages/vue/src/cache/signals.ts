import type { EffectScope } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { Signal } from './signalInternals'
import type { SignalRegistry } from './signalTypes'
import { getCurrentInstance, getCurrentScope, getCurrentWatcher, onScopeDispose, onWatcherCleanup, shallowRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

export type { SignalRegistry } from './signalTypes'

/** Signal with Core interest ownership metadata. */
interface InternalSignal extends Signal {
  /** Dependency kind registered in Core. */
  kind: 'item' | 'list' | 'index'
  /** Owning collection. */
  collection: string
  /** Canonical key or opaque dependency id. */
  id: string
  /** Whether Vue is synchronously rerunning owners from this signal. */
  triggering: boolean
  /** Whether final owner cleanup must release interest after current rerun. */
  pendingRelease: boolean
}

/** Create lifecycle signals retained only while reactive owners exist. */
export function createSignalRegistry(options: { isServer: boolean, interest: CacheChangeInterestRegistry }): SignalRegistry {
  if (options.isServer) {
    const noopTrack = () => false
    const noop = () => {}
    return { trackItem: noopTrack, trackList: noopTrack, trackIndex: noopTrack, flush: noop, flushItem: noop, flushIndex: noop, reset: noop, dispose: noop, size: () => ({ items: 0, lists: 0, indexes: 0 }) }
  }

  const itemSignals = new Map<string, Map<string, InternalSignal>>()
  const listSignals = new Map<string, InternalSignal>()
  const indexSignals = new Map<string, InternalSignal>()
  let ownerSignals = new WeakMap<object, Set<InternalSignal>>()
  let cleanupRegistered = new WeakSet<object>()
  let disposed = false
  let selectedOwnerScope: EffectScope | undefined
  /** Find watcher or effect scope owning current reactive read. */
  function getOwner(): object | undefined {
    selectedOwnerScope = undefined
    const watcher = getCurrentWatcher() as object | undefined
    if (watcher)
      return watcher
    const instance = getCurrentInstance() as { scope?: EffectScope } | null
    const scope = getCurrentScope() ?? instance?.scope
    if (!scope?.active)
      return undefined
    selectedOwnerScope = scope
    return scope
  }

  /** Register matching cleanup hook once for current owner run. */
  function registerCleanup(owner: object, scope: EffectScope | undefined): void {
    if (cleanupRegistered.has(owner))
      return
    cleanupRegistered.add(owner)
    const cleanup = () => releaseOwner(owner)
    if (scope) {
      const register = () => onScopeDispose(cleanup)
      getCurrentScope() === scope ? register() : scope.run(register)
    }
    else {
      onWatcherCleanup(cleanup)
    }
  }

  /** Release dependencies from one stopped or rerunning owner. */
  function releaseOwner(owner: object): void {
    const signals = ownerSignals.get(owner)
    if (!signals)
      return
    cleanupRegistered.delete(owner)
    for (const signal of signals) {
      signal.owners.delete(owner)
      if (!signal.owners.size) {
        if (signal.triggering) {
          signal.pendingRelease = true
        }
        else {
          releaseInterest(signal)
          signal.remove()
        }
      }
    }
    // Keep empty Set behind weak key for synchronous reruns; WeakMap still permits collection.
    signals.clear()
  }

  /** Retain one signal for current owner and consume its version. */
  function retain(signal: InternalSignal, owner: object, scope: EffectScope | undefined): boolean {
    const owned = ownerSignals.get(owner) ?? new Set<InternalSignal>()
    ownerSignals.set(owner, owned)
    if (!owned.has(signal)) {
      if (!signal.owners.size) {
        if (signal.pendingRelease) {
          signal.pendingRelease = false
        }
        else {
          retainInterest(signal)
        }
      }
      owned.add(signal)
      signal.owners.add(owner)
      registerCleanup(owner, scope)
    }
    // eslint-disable-next-line ts/no-unused-expressions
    signal.ref.value
    return true
  }

  /** Track or create one list/index signal. */
  function trackFlat(registry: Map<string, InternalSignal>, kind: 'list' | 'index', collection: string, id: string): boolean {
    if (disposed)
      return false
    const owner = getOwner()
    if (!owner)
      return false
    let signal = registry.get(id)
    if (!signal) {
      signal = createSignal(kind, collection, id, () => registry.delete(id))
      registry.set(id, signal)
    }
    return retain(signal, owner, selectedOwnerScope)
  }

  /** Track or create one exact missing-item signal. */
  function trackItem(collection: string, key: string | number): boolean {
    if (disposed)
      return false
    const owner = getOwner()
    if (!owner)
      return false
    const id = String(key)
    const byKey = itemSignals.get(collection) ?? new Map<string, InternalSignal>()
    itemSignals.set(collection, byKey)
    let signal = byKey.get(id)
    if (!signal) {
      signal = createSignal('item', collection, id, () => {
        byKey.delete(id)
        if (!byKey.size)
          itemSignals.delete(collection)
      })
      byKey.set(id, signal)
    }
    return retain(signal, owner, selectedOwnerScope)
  }

  /** Create one signal that becomes retained with its first owner. */
  function createSignal(kind: InternalSignal['kind'], collection: string, id: string, remove: () => void): InternalSignal {
    const signal: InternalSignal = {
      kind,
      collection,
      id,
      ref: shallowRef(0),
      owners: new Set(),
      remove,
      triggering: false,
      pendingRelease: false,
    }
    return signal
  }

  /** Register one active dependency with Core. */
  function retainInterest(signal: InternalSignal): void {
    if (signal.kind === 'item')
      options.interest.retainItem(signal.collection, signal.id)
    else if (signal.kind === 'list')
      options.interest.retainList(signal.collection)
    else options.interest.retainIndex(signal.collection, signal.id)
  }

  /** Unregister one inactive dependency from Core. */
  function releaseInterest(signal: InternalSignal): void {
    if (signal.kind === 'item')
      options.interest.releaseItem(signal.collection, signal.id)
    else if (signal.kind === 'list')
      options.interest.releaseList(signal.collection)
    else options.interest.releaseIndex(signal.collection, signal.id)
  }

  /** Increment one active signal while collecting sync watcher errors. */
  function trigger(signal: InternalSignal | undefined, errors: unknown[] | undefined): unknown[] | undefined {
    if (!signal?.owners.size)
      return errors
    signal.triggering = true
    try {
      signal.ref.value++
    }
    catch (error) {
      return appendSyncError(errors, error)
    }
    finally {
      signal.triggering = false
      if (signal.pendingRelease) {
        signal.pendingRelease = false
        releaseInterest(signal)
        signal.remove()
      }
    }
    return errors
  }

  /** Return active registry counts. */
  function activeSize(): { items: number, lists: number, indexes: number } {
    let items = 0
    for (const byKey of itemSignals.values()) {
      for (const signal of byKey.values()) items += signal.owners.size ? 1 : 0
    }
    let lists = 0
    for (const signal of listSignals.values()) lists += signal.owners.size ? 1 : 0
    let indexes = 0
    for (const signal of indexSignals.values()) indexes += signal.owners.size ? 1 : 0
    return { items, lists, indexes }
  }

  /** Invalidate all active dependencies once. */
  function reset(): void {
    if (disposed)
      return
    let errors: unknown[] | undefined
    for (const byKey of itemSignals.values()) {
      for (const signal of [...byKey.values()]) errors = trigger(signal, errors)
    }
    for (const signal of [...listSignals.values(), ...indexSignals.values()]) errors = trigger(signal, errors)
    throwSyncErrors(errors, 'Signal reset failed')
  }

  /** Release all active signals. */
  function dispose(): void {
    if (disposed)
      return
    disposed = true
    for (const byKey of itemSignals.values()) {
      for (const signal of byKey.values()) {
        if (signal.owners.size)
          releaseInterest(signal)
      }
    }
    for (const signal of [...listSignals.values(), ...indexSignals.values()]) {
      if (signal.owners.size)
        releaseInterest(signal)
    }
    itemSignals.clear()
    listSignals.clear()
    indexSignals.clear()
    ownerSignals = new WeakMap()
    cleanupRegistered = new WeakSet()
  }

  return {
    trackItem,
    trackList: collection => trackFlat(listSignals, 'list', collection, collection),
    trackIndex: (collection, dependency) => trackFlat(indexSignals, 'index', collection, dependency),
    flush(changes) {
      let errors: unknown[] | undefined
      for (const [collection, keys] of changes.items) {
        const byKey = itemSignals.get(collection)
        for (const key of keys) errors = trigger(byKey?.get(key), errors)
      }
      for (const collection of changes.lists) errors = trigger(listSignals.get(collection), errors)
      for (const dependency of changes.indexes) errors = trigger(indexSignals.get(dependency), errors)
      throwSyncErrors(errors, 'Signal synchronization failed')
    },
    flushItem(collection, key) {
      throwSyncErrors(trigger(itemSignals.get(collection)?.get(key), undefined), 'Signal synchronization failed')
    },
    flushIndex(dependency) {
      throwSyncErrors(trigger(indexSignals.get(dependency), undefined), 'Signal synchronization failed')
    },
    reset,
    dispose,
    size: activeSize,
  }
}
