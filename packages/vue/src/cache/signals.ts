import type { StoreEngine } from '@rstore/core'
import type { CacheIndexValue } from '@rstore/shared'
import type { EffectScope } from 'vue'
import type { Signal, SignalOwner } from './signalInternals'
import { getCurrentInstance, getCurrentScope, getCurrentWatcher, onScopeDispose, onWatcherCleanup, shallowRef } from 'vue'
import { getIndexSignalId } from './signalInternals'

/** Reactive bridge between engine observers and Vue effects. */
export interface SignalRegistry {
  /** Track a single item signal. */
  trackItem: (collection: string, key: string | number) => boolean
  /** Track one collection's visible-key signal. */
  trackList: (collection: string) => boolean
  /** Track one collection index bucket signal. */
  trackIndex: (collection: string, indexKey: string, indexValue: CacheIndexValue) => boolean
  /** Unsubscribe every registered signal. */
  dispose: () => void
  /** Count active signal subscriptions for diagnostics and tests. */
  size: () => { items: number, lists: number, indexes: number }
}

/** Options for creating a Vue signal registry. */
export interface CreateSignalRegistryOptions {
  /** Framework-agnostic observer source. */
  engine: StoreEngine
  /** Server caches avoid creating Vue watcher subscriptions. */
  isServer: boolean
}

/** Create a signal registry whose subscriptions die with their Vue owners. */
export function createSignalRegistry({ engine, isServer }: CreateSignalRegistryOptions): SignalRegistry {
  if (isServer) {
    const noop = () => false
    return { trackItem: noop, trackList: noop, trackIndex: noop, dispose: noop, size: () => ({ items: 0, lists: 0, indexes: 0 }) }
  }

  const itemSignals = new Map<string, Map<string, Signal>>()
  const listSignals = new Map<string, Signal>()
  const indexSignals = new Map<string, Map<string, Map<string, Signal>>>()
  const ownerSignals = new WeakMap<object, Set<Signal>>()
  const cleanupRegistered = new WeakSet<object>()
  let disposed = false
  /** Find the scope/watcher that owns a reactive cache read. */
  function getOwner(): SignalOwner | undefined {
    const watcher = getCurrentWatcher() as object | undefined
    if (watcher) {
      // Watcher cleanup runs on dependency churn and individual stop. A
      // surrounding scope would retain every historical dependency instead.
      return { value: watcher }
    }
    const instance = getCurrentInstance() as { scope?: EffectScope } | null
    const scope = getCurrentScope() ?? instance?.scope
    if (scope?.active) {
      return { value: scope, scope }
    }
    return undefined
  }

  /** Read a signal version so Vue records the current reactive dependency. */
  function track(signal: Signal): void {
    // eslint-disable-next-line ts/no-unused-expressions
    signal.ref.value
  }

  /** Stop an engine observer once even if cache and scope dispose overlap. */
  function stopSignal(signal: Signal): void {
    if (!signal.stopped) {
      signal.stopped = true
      signal.stop()
    }
  }

  /** Remove all subscriptions owned by one stopped scope or watcher. */
  function releaseOwner(owner: object): void {
    const signals = ownerSignals.get(owner)
    if (!signals) {
      return
    }
    ownerSignals.delete(owner)
    cleanupRegistered.delete(owner)
    for (const signal of signals) {
      signal.owners.delete(owner)
      if (signal.owners.size === 0) {
        stopSignal(signal)
        signal.remove()
      }
    }
  }

  /** Register the matching Vue cleanup hook once for an owner. */
  function registerCleanup(owner: SignalOwner): void {
    if (cleanupRegistered.has(owner.value)) {
      return
    }
    cleanupRegistered.add(owner.value)
    const cleanup = () => releaseOwner(owner.value)
    if (owner.scope) {
      const register = () => onScopeDispose(cleanup)
      if (getCurrentScope() === owner.scope) {
        register()
      }
      else {
        owner.scope.run(register)
      }
    }
    else {
      onWatcherCleanup(cleanup)
    }
  }

  /** Retain one signal for its current owner. */
  function retain(signal: Signal, owner: SignalOwner): void {
    const owned = ownerSignals.get(owner.value) ?? new Set<Signal>()
    ownerSignals.set(owner.value, owned)
    if (owned.has(signal)) {
      return
    }
    owned.add(signal)
    signal.owners.add(owner.value)
    registerCleanup(owner)
  }

  /** Create a signal only when a live Vue owner is reading it. */
  function ensureSignal(create: () => Signal): Signal | undefined {
    if (disposed) {
      return undefined
    }
    const owner = getOwner()
    if (!owner) {
      return undefined
    }
    const signal = create()
    retain(signal, owner)
    track(signal)
    return signal
  }

  /** Track a collection item under canonical string/number key identity. */
  function trackItem(collection: string, key: string | number): boolean {
    const id = String(key)
    const signal = itemSignals.get(collection)?.get(id)
    if (!signal) {
      return Boolean(ensureSignal(() => {
        const ref = shallowRef(0)
        const stop = engine.observeItem(collection, id, () => ref.value++)
        const created: Signal = {
          ref,
          stop,
          stopped: false,
          owners: new Set(),
          remove: () => {
            const byKey = itemSignals.get(collection)
            if (byKey?.get(id) === created) {
              byKey.delete(id)
              if (byKey.size === 0) {
                itemSignals.delete(collection)
              }
            }
          },
        }
        itemSignals.set(collection, itemSignals.get(collection) ?? new Map())
        itemSignals.get(collection)!.set(id, created)
        return created
      }))
    }
    const owner = getOwner()
    if (owner) {
      retain(signal, owner)
      track(signal)
      return true
    }
    return false
  }

  /** Track a collection visible-key set. */
  function trackList(collection: string): boolean {
    const signal = listSignals.get(collection)
    if (!signal) {
      return Boolean(ensureSignal(() => {
        const ref = shallowRef(0)
        const stop = engine.observeList(collection, () => ref.value++)
        const created: Signal = {
          ref,
          stop,
          stopped: false,
          owners: new Set(),
          remove: () => {
            if (listSignals.get(collection) === created) {
              listSignals.delete(collection)
            }
          },
        }
        listSignals.set(collection, created)
        return created
      }))
    }
    const owner = getOwner()
    if (owner) {
      retain(signal, owner)
      track(signal)
      return true
    }
    return false
  }

  /** Track a relation/index bucket. */
  function trackIndex(collection: string, indexKey: string, indexValue: CacheIndexValue): boolean {
    const valueId = getIndexSignalId(indexValue)
    const signal = indexSignals.get(collection)?.get(indexKey)?.get(valueId)
    if (!signal) {
      return Boolean(ensureSignal(() => {
        const ref = shallowRef(0)
        const stop = engine.observeIndex(collection, indexKey, indexValue, () => ref.value++)
        const created: Signal = {
          ref,
          stop,
          stopped: false,
          owners: new Set(),
          remove: () => {
            const byValue = indexSignals.get(collection)?.get(indexKey)
            if (byValue?.get(valueId) === created) {
              byValue.delete(valueId)
              if (byValue.size === 0) {
                indexSignals.get(collection)!.delete(indexKey)
              }
              if (indexSignals.get(collection)?.size === 0) {
                indexSignals.delete(collection)
              }
            }
          },
        }
        const byIndex = indexSignals.get(collection) ?? new Map<string, Map<string, Signal>>()
        indexSignals.set(collection, byIndex)
        const byValue = byIndex.get(indexKey) ?? new Map<string, Signal>()
        byIndex.set(indexKey, byValue)
        byValue.set(valueId, created)
        return created
      }))
    }
    const owner = getOwner()
    if (owner) {
      retain(signal, owner)
      track(signal)
      return true
    }
    return false
  }

  /** Stop all engine observers when the whole cache is disposed. */
  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    const signals = [
      ...Array.from(itemSignals.values()).flatMap(byKey => Array.from(byKey.values())),
      ...listSignals.values(),
      ...Array.from(indexSignals.values()).flatMap(byIndex => Array.from(byIndex.values()).flatMap(byValue => Array.from(byValue.values()))),
    ]
    for (const signal of signals) {
      stopSignal(signal)
      signal.owners.clear()
    }
    itemSignals.clear()
    listSignals.clear()
    indexSignals.clear()
  }

  /** Count current active subscriptions. */
  function size(): { items: number, lists: number, indexes: number } {
    let items = 0
    let indexes = 0
    for (const byKey of itemSignals.values()) {
      items += byKey.size
    }
    for (const byIndex of indexSignals.values()) {
      for (const byValue of byIndex.values()) {
        indexes += byValue.size
      }
    }
    return { items, lists: listSignals.size, indexes }
  }

  return { trackItem, trackList, trackIndex, dispose, size }
}
