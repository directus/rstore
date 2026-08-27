import type { EngineChangeSet } from '@rstore/core'
import type { EffectScope } from 'vue'
import type { Signal, SignalOwner } from './signalInternals'
import { getCurrentInstance, getCurrentScope, getCurrentWatcher, onScopeDispose, onWatcherCleanup, shallowRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** Lifecycle-owned Vue list and index dependency registry. */
export interface SignalRegistry {
  /** Track one collection visible-key signal. */
  trackList: (collection: string) => boolean
  /** Track one opaque exact index dependency. */
  trackIndex: (dependency: string) => boolean
  /** Publish one engine operation's list and index changes. */
  flush: (changes: EngineChangeSet) => void
  /** Invalidate all retained signals after collection replacement. */
  reset: () => void
  /** Release every retained signal. */
  dispose: () => void
  /** Count active signal dependencies for diagnostics. */
  size: () => { items: number, lists: number, indexes: number }
}

/** Create a registry whose signals die with their Vue owners. */
export function createSignalRegistry({ isServer }: { isServer: boolean }): SignalRegistry {
  if (isServer) {
    const noopTrack = () => false
    const noop = () => {}
    return { trackList: noopTrack, trackIndex: noopTrack, flush: noop, reset: noop, dispose: noop, size: emptySize }
  }

  const listSignals = new Map<string, Signal>()
  const indexSignals = new Map<string, Signal>()
  let ownerSignals = new WeakMap<object, Set<Signal>>()
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

  /** Consume one version so Vue records dependency. */
  function track(signal: Signal): void {
    // eslint-disable-next-line ts/no-unused-expressions
    signal.ref.value
  }

  /** Remove all signals owned only by a stopped watcher or scope. */
  function releaseOwner(owner: object): void {
    const signals = ownerSignals.get(owner)
    if (!signals)
      return
    ownerSignals.delete(owner)
    cleanupRegistered.delete(owner)
    for (const signal of signals) {
      signal.owners.delete(owner)
      if (!signal.owners.size)
        signal.remove()
    }
  }

  /** Register exact owner cleanup once. */
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

  /** Retain one dependency for current owner and consume it. */
  function retain(signal: Signal, owner: SignalOwner): boolean {
    const owned = ownerSignals.get(owner.value) ?? new Set<Signal>()
    ownerSignals.set(owner.value, owned)
    if (!owned.has(signal)) {
      owned.add(signal)
      signal.owners.add(owner.value)
      registerCleanup(owner)
    }
    track(signal)
    return true
  }

  /** Track or create one lifecycle-owned signal. */
  function trackSignal(registry: Map<string, Signal>, id: string): boolean {
    if (disposed)
      return false
    const owner = getOwner()
    if (!owner)
      return false
    let signal = registry.get(id)
    if (!signal) {
      signal = {
        ref: shallowRef(0),
        owners: new Set(),
        remove: () => {
          if (registry.get(id) === signal)
            registry.delete(id)
        },
      }
      registry.set(id, signal)
    }
    return retain(signal, owner)
  }

  /** Invalidate every current signal once. */
  function reset(): void {
    if (disposed)
      return
    // Sync watchers can replace their signal during invalidation. Snapshot
    // registries so newly installed dependencies wait for next state change.
    for (const signal of [...listSignals.values()]) signal.ref.value++
    for (const signal of [...indexSignals.values()]) signal.ref.value++
  }

  /** Release all registry ownership without touching stopped owners. */
  function dispose(): void {
    if (disposed)
      return
    disposed = true
    for (const signal of [...listSignals.values(), ...indexSignals.values()]) signal.owners.clear()
    listSignals.clear()
    indexSignals.clear()
    ownerSignals = new WeakMap()
    cleanupRegistered = new WeakSet()
  }

  return {
    trackList: collection => trackSignal(listSignals, collection),
    trackIndex: dependency => trackSignal(indexSignals, dependency),
    flush(changes) {
      let errors: unknown[] | undefined
      if (listSignals.size) {
        for (const collection of changes.lists) {
          const signal = listSignals.get(collection)
          try {
            if (signal)
              signal.ref.value++
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
      if (indexSignals.size) {
        for (const dependency of changes.indexes) {
          const signal = indexSignals.get(dependency)
          try {
            if (signal)
              signal.ref.value++
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
      throwSyncErrors(errors, 'List and index signal synchronization failed')
    },
    reset,
    dispose,
    size: () => ({ items: 0, lists: listSignals.size, indexes: indexSignals.size }),
  }
}

/** Empty diagnostic size for server registries. */
function emptySize(): { items: number, lists: number, indexes: number } {
  return { items: 0, lists: 0, indexes: 0 }
}
