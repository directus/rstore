import type { EngineChangeSet } from '@rstore/core'
import type { EffectScope } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { Signal, SignalOwner } from './signalInternals'
import { getCurrentInstance, getCurrentScope, getCurrentWatcher, onScopeDispose, onWatcherCleanup, shallowRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

const MAX_ORPHAN_SIGNALS = 256

/** Lifecycle-owned Vue dependency registry. */
export interface SignalRegistry {
  /** Track one missing item by canonical key. */
  trackItem: (collection: string, key: string | number) => boolean
  /** Track one collection visible-key signal. */
  trackList: (collection: string) => boolean
  /** Track one opaque exact index dependency. */
  trackIndex: (collection: string, dependency: string) => boolean
  /** Publish one engine operation's changes. */
  flush: (changes: EngineChangeSet) => void
  /** Invalidate every active signal after reset. */
  reset: () => void
  /** Release every retained signal. */
  dispose: () => void
  /** Count active dependencies for diagnostics. */
  size: () => { items: number, lists: number, indexes: number }
}

/** Signal with Core interest ownership metadata. */
interface InternalSignal extends Signal {
  /** Dependency kind registered in Core. */
  kind: 'item' | 'list' | 'index'
  /** Owning collection. */
  collection: string
  /** Canonical key or opaque dependency id. */
  id: string
}

/** Create lifecycle signals with bounded inactive-entry reuse. */
export function createSignalRegistry(options: { isServer: boolean, interest: CacheChangeInterestRegistry }): SignalRegistry {
  if (options.isServer) {
    const noopTrack = () => false
    const noop = () => {}
    return { trackItem: noopTrack, trackList: noopTrack, trackIndex: noopTrack, flush: noop, reset: noop, dispose: noop, size: emptySize }
  }

  const itemSignals = new Map<string, Map<string, InternalSignal>>()
  const listSignals = new Map<string, InternalSignal>()
  const indexSignals = new Map<string, InternalSignal>()
  const orphans = new Map<InternalSignal, true>()
  let ownerSignals = new WeakMap<object, Set<InternalSignal>>()
  let cleanupRegistered = new WeakSet<object>()
  let disposed = false

  /** Find watcher or effect scope owning current reactive read. */
  function getOwner(): SignalOwner | undefined {
    const watcher = getCurrentWatcher() as object | undefined
    if (watcher)
      return { value: watcher }
    const instance = getCurrentInstance() as { scope?: EffectScope } | null
    const scope = getCurrentScope() ?? instance?.scope
    return scope?.active ? { value: scope, scope } : undefined
  }

  /** Register matching cleanup hook once for current owner run. */
  function registerCleanup(owner: SignalOwner): void {
    if (cleanupRegistered.has(owner.value))
      return
    cleanupRegistered.add(owner.value)
    const cleanup = () => releaseOwner(owner.value)
    if (owner.scope) {
      const register = () => onScopeDispose(cleanup)
      getCurrentScope() === owner.scope ? register() : owner.scope.run(register)
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
    ownerSignals.delete(owner)
    cleanupRegistered.delete(owner)
    for (const signal of signals) {
      signal.owners.delete(owner)
      if (!signal.owners.size) {
        releaseInterest(signal)
        retainOrphan(signal)
      }
    }
  }

  /** Retain one signal for current owner and consume its version. */
  function retain(signal: InternalSignal, owner: SignalOwner): boolean {
    const owned = ownerSignals.get(owner.value) ?? new Set<InternalSignal>()
    ownerSignals.set(owner.value, owned)
    if (!owned.has(signal)) {
      if (!signal.owners.size) {
        orphans.delete(signal)
        retainInterest(signal)
      }
      owned.add(signal)
      signal.owners.add(owner.value)
      registerCleanup(owner)
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
    return retain(signal, owner)
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
    return retain(signal, owner)
  }

  /** Create one inactive reusable signal. */
  function createSignal(kind: InternalSignal['kind'], collection: string, id: string, remove: () => void): InternalSignal {
    const signal: InternalSignal = { kind, collection, id, ref: shallowRef(0), owners: new Set(), remove }
    retainOrphan(signal)
    return signal
  }

  /** Retain one inactive signal and prune oldest excess entries. */
  function retainOrphan(signal: InternalSignal): void {
    orphans.delete(signal)
    orphans.set(signal, true)
    const limit = Math.max(MAX_ORPHAN_SIGNALS, activeCount() * 2)
    while (orphans.size > limit) {
      const oldest = orphans.keys().next().value as InternalSignal | undefined
      if (!oldest)
        break
      orphans.delete(oldest)
      oldest.remove()
    }
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
    try {
      signal.ref.value++
    }
    catch (error) {
      return appendSyncError(errors, error)
    }
    return errors
  }

  /** Count active signals across all registries. */
  function activeCount(): number {
    const size = activeSize()
    return size.items + size.lists + size.indexes
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

  /** Release all active and reusable signals. */
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
    orphans.clear()
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
    reset,
    dispose,
    size: activeSize,
  }
}

/** Empty diagnostics for server registries. */
function emptySize(): { items: number, lists: number, indexes: number } {
  return { items: 0, lists: 0, indexes: 0 }
}
