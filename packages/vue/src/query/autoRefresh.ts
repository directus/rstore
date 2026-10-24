import { tryOnScopeDispose } from '@vueuse/core'
import { watch } from 'vue'
import { onWindowFocus } from '../swr'

/**
 * Refresh the query when the window regains focus, following the reactive
 * `autoRefresh` option (including store `findDefaults`).
 *
 * @param ctx Query context, providing the store and the resolved option.
 * @param refresh Refreshes the query.
 */
export function installAutoRefresh(ctx: any, refresh: () => unknown): void {
  // A server never receives focus, and its component scopes are never
  // stopped: registering would only retain each request's store.
  if (ctx.store.$isServer) {
    return
  }
  let stopAutoRefresh: (() => void) | undefined
  watch(ctx.getAutoRefresh, (autoRefresh) => {
    stopAutoRefresh?.()
    // The focus hook is module-level. The query scope, which the store's
    // disposal also stops (see `runApiQuery`), releases it.
    stopAutoRefresh = autoRefresh === 'windowFocus'
      ? onWindowFocus(() => refresh())
      : undefined
  }, { immediate: true })
  tryOnScopeDispose(() => stopAutoRefresh?.())
}
