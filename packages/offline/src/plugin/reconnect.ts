/**
 * How long to wait after the last browser `online` event before syncing.
 * Browsers fire the event repeatedly on flaky links; the debounce collapses a
 * burst into a single sync.
 */
export const ONLINE_SYNC_DEBOUNCE_MS = 1000

/**
 * The single window `online` listener. Module-level singleton because the
 * plugin api has no teardown hook: re-registering one listener per store
 * would accumulate them across store recreations (HMR, tests).
 */
let onlineListener: (() => void) | null = null

/** Sync trigger of the most recently initialized store. */
let currentTrigger: (() => void) | null = null

/** Pending debounce timer for the `online` event. */
let debounceTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Register the browser reconnect listener that triggers a sync.
 *
 * The `online` event is debounced, and a new sync is never started while one
 * triggered from here is still in flight. Only the most recently initialized
 * store is triggered — the previous trigger is replaced, not stacked.
 */
export function installReconnectHook(hook: any) {
  hook('init', ({ store }: any) => {
    // In-flight guard: flaky connections fire `online` faster than a full
    // sync completes; overlapping syncs would replay the same queue twice.
    let syncing = false
    currentTrigger = async () => {
      if (syncing) {
        return
      }
      syncing = true
      try {
        await store.$sync()
      }
      catch (error) {
        // The trigger is fire-and-forget (called from a timer), so a rejection
        // here would otherwise surface as an unhandled promise rejection.
        console.error('[rstore/offline] Sync after reconnect failed', error)
      }
      finally {
        syncing = false
      }
    }

    if (!onlineListener) {
      onlineListener = () => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => currentTrigger?.(), ONLINE_SYNC_DEBOUNCE_MS)
      }
      window.addEventListener('online', onlineListener)
    }
  })
}

/**
 * Remove the singleton `online` listener and reset the trigger state.
 * Intended for tests and manual teardown.
 */
export function disposeReconnectListener() {
  clearTimeout(debounceTimer)
  debounceTimer = undefined
  if (onlineListener) {
    window.removeEventListener('online', onlineListener)
    onlineListener = null
  }
  currentTrigger = null
}
