import type { Cache } from '@rstore/shared'
import type { VueCachePrivate } from './cache/types'
import type { VueStore } from './store'
import { effect, stop } from 'vue'

/**
 * Track relation reads while scheduling their expensive traversal once per
 * cache publication. A sync Vue watcher would rerun its source for every row.
 */
export function watchQueryTracking<T>(store: VueStore, source: () => T, reconcile: (value: T) => void): () => void {
  const batch = (store.$cache as Cache & VueCachePrivate)._private.trackingEffects
  let active = true
  const runner = effect(source, {
    scheduler: () => batch.schedule(update),
    onStop: () => {
      active = false
      batch.cancel(update)
    },
  })

  /** Read dependencies inside their effect; reconcile outside it as watch does. */
  function update(): void {
    if (active)
      reconcile(runner())
  }

  return () => stop(runner)
}
