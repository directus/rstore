import type { Cache } from '@rstore/shared'
import type { VueCachePrivate } from './cache/types'
import type { VueStore } from './store'
import { effect, stop } from 'vue'

/** Options for {@link watchQueryTracking}. */
export interface WatchQueryTrackingOptions {
  /** Reconcile the first source value instead of only collecting its dependencies. */
  immediate?: boolean
}

/**
 * Track relation reads while scheduling their expensive traversal once per
 * cache publication. A sync Vue watcher would rerun its source for every row.
 */
export function watchQueryTracking<T>(store: VueStore, source: () => T, reconcile: (value: T) => void, options?: WatchQueryTrackingOptions): () => void {
  const batch = (store.$cache as Cache & VueCachePrivate)._private.trackingEffects
  let active = true
  // `effect()` runs its source once and has no lazy mode: keep that first value.
  let first = true
  let initial: { value: T } | undefined
  const runner = effect(() => {
    const value = source()
    if (first) {
      first = false
      if (options?.immediate)
        initial = { value }
    }
    return value
  }, {
    scheduler: () => batch.schedule(update),
    onStop: () => {
      active = false
      batch.cancel(update)
    },
  })
  if (initial) {
    const { value } = initial
    initial = undefined
    reconcile(value)
  }

  /** Read dependencies inside their effect; reconcile outside it as watch does. */
  function update(): void {
    if (active)
      reconcile(runner())
  }

  return () => stop(runner)
}
