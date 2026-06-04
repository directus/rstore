import type { StoreEngine, Unsubscribe } from '@rstore/core'
import type { ShallowRef } from 'vue'
import { shallowRef } from 'vue'

/** Reactive bridge between engine observers and Vue effects. */
export interface SignalRegistry {
  /** Track a single item's signal, subscribing lazily. */
  trackItem: (collection: string, key: string | number) => void
  /** Track a collection's visible-key-set signal. */
  trackList: (collection: string) => void
  /** Track a single index bucket's signal. */
  trackIndex: (collection: string, indexKey: string, indexValue: string) => void
  /** Drop an item's signal and unsubscribe its engine observer. */
  dropItem: (collection: string, key: string | number) => void
  /** Drop an index bucket's signal and unsubscribe its engine observer. */
  dropIndexBucket: (collection: string, indexKey: string, indexValue: string) => void
  /** Unsubscribe every registered signal. */
  dispose: () => void
}

interface Signal {
  /** Vue ref used as a version counter. */
  ref: ShallowRef<number>
  /** Engine observer unsubscribe callback. */
  stop: Unsubscribe
}

/** Options for creating a Vue signal registry. */
export interface CreateSignalRegistryOptions {
  /** Engine whose observer API drives this registry. */
  engine: StoreEngine
  /** Whether tracking should be disabled for server-side rendering. */
  isServer: boolean
}

/** Create the signal registry bound to an engine. */
export function createSignalRegistry({ engine, isServer }: CreateSignalRegistryOptions): SignalRegistry {
  if (isServer) {
    const noop = () => {}
    return {
      trackItem: noop,
      trackList: noop,
      trackIndex: noop,
      dropItem: noop,
      dropIndexBucket: noop,
      dispose: noop,
    }
  }

  const itemSignals = new Map<string, Map<string | number, Signal>>()
  const listSignals = new Map<string, Signal>()
  const indexSignals = new Map<string, Map<string, Map<string, Signal>>>()

  /** Read a signal's version to register the current effect dependency. */
  function track(signal: Signal): void {
    // eslint-disable-next-line ts/no-unused-expressions
    signal.ref.value
  }

  /** Track a single item and subscribe to it on first use. */
  function trackItem(collection: string, key: string | number): void {
    let byKey = itemSignals.get(collection)
    if (!byKey) {
      byKey = new Map()
      itemSignals.set(collection, byKey)
    }
    let signal = byKey.get(key)
    if (!signal) {
      const ref = shallowRef(0)
      const stop = engine.observeItem(collection, key, () => ref.value++)
      signal = { ref, stop }
      byKey.set(key, signal)
    }
    track(signal)
  }

  /** Track a collection list and subscribe to it on first use. */
  function trackList(collection: string): void {
    let signal = listSignals.get(collection)
    if (!signal) {
      const ref = shallowRef(0)
      const stop = engine.observeList(collection, () => ref.value++)
      signal = { ref, stop }
      listSignals.set(collection, signal)
    }
    track(signal)
  }

  /** Track one collection index bucket and subscribe to it on first use. */
  function trackIndex(collection: string, indexKey: string, indexValue: string): void {
    let byIndexKey = indexSignals.get(collection)
    if (!byIndexKey) {
      byIndexKey = new Map()
      indexSignals.set(collection, byIndexKey)
    }
    let byValue = byIndexKey.get(indexKey)
    if (!byValue) {
      byValue = new Map()
      byIndexKey.set(indexKey, byValue)
    }
    let signal = byValue.get(indexValue)
    if (!signal) {
      const ref = shallowRef(0)
      const stop = engine.observeIndex(collection, indexKey, indexValue, () => ref.value++)
      signal = { ref, stop }
      byValue.set(indexValue, signal)
    }
    track(signal)
  }

  /** Drop an item signal and unsubscribe its observer. */
  function dropItem(collection: string, key: string | number): void {
    const byKey = itemSignals.get(collection)
    const signal = byKey?.get(key)
    if (signal) {
      signal.stop()
      byKey!.delete(key)
    }
  }

  /** Drop an index signal and unsubscribe its observer. */
  function dropIndexBucket(collection: string, indexKey: string, indexValue: string): void {
    const signal = indexSignals.get(collection)?.get(indexKey)?.get(indexValue)
    if (signal) {
      signal.stop()
      indexSignals.get(collection)!.get(indexKey)!.delete(indexValue)
    }
  }

  /** Dispose every registered signal subscription. */
  function dispose(): void {
    for (const byKey of itemSignals.values()) {
      for (const signal of byKey.values()) {
        signal.stop()
      }
    }
    for (const signal of listSignals.values()) {
      signal.stop()
    }
    for (const byIndexKey of indexSignals.values()) {
      for (const byValue of byIndexKey.values()) {
        for (const signal of byValue.values()) {
          signal.stop()
        }
      }
    }
    itemSignals.clear()
    listSignals.clear()
    indexSignals.clear()
  }

  return {
    trackItem,
    trackList,
    trackIndex,
    dropItem,
    dropIndexBucket,
    dispose,
  }
}
