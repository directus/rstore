import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disposeReconnectListener, installReconnectHook, ONLINE_SYNC_DEBOUNCE_MS } from '../src/plugin/reconnect'
import { createHookCollector } from './utils/plugin'

// Browsers fire the `online` event repeatedly on flaky links, and each fired
// event used to start a full `$sync`. Overlapping syncs replay the same queue
// twice, so the reconnect trigger must debounce the event and never start a
// second sync while one is still in flight. The listener is also a module
// singleton: recreating the store (HMR, tests) must not stack listeners.

describe('reconnect sync trigger', () => {
  let onlineListeners: Set<() => void>

  beforeEach(() => {
    vi.useFakeTimers()
    onlineListeners = new Set()
    vi.stubGlobal('window', {
      addEventListener: (name: string, callback: () => void) => {
        if (name === 'online') {
          onlineListeners.add(callback)
        }
      },
      removeEventListener: (name: string, callback: () => void) => {
        if (name === 'online') {
          onlineListeners.delete(callback)
        }
      },
    })
  })

  afterEach(() => {
    disposeReconnectListener()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  /** Fires the browser `online` event on every registered listener. */
  function fireOnline() {
    for (const listener of onlineListeners) {
      listener()
    }
  }

  /** Installs the reconnect hook and runs its `init` registration. */
  async function install(store: any) {
    const collector = createHookCollector()
    installReconnectHook(collector.hook)
    await collector.run('init', { store })
  }

  it('debounces a burst of online events into a single sync', async () => {
    const store = { $sync: vi.fn(async () => {}) }
    await install(store)

    fireOnline()
    fireOnline()
    fireOnline()
    expect(store.$sync).not.toHaveBeenCalled()

    vi.advanceTimersByTime(ONLINE_SYNC_DEBOUNCE_MS)
    expect(store.$sync).toHaveBeenCalledTimes(1)
  })

  it('skips a reconnect sync while one is already in flight', async () => {
    let releaseSync!: () => void
    const store = {
      $sync: vi.fn(() => new Promise<void>((resolve) => {
        releaseSync = resolve
      })),
    }
    await install(store)

    fireOnline()
    vi.advanceTimersByTime(ONLINE_SYNC_DEBOUNCE_MS)
    expect(store.$sync).toHaveBeenCalledTimes(1)

    // A second online event while the first sync is still pending.
    fireOnline()
    vi.advanceTimersByTime(ONLINE_SYNC_DEBOUNCE_MS)
    expect(store.$sync).toHaveBeenCalledTimes(1)

    // Once the sync settles, a new online event triggers a fresh one.
    releaseSync()
    await Promise.resolve()
    await Promise.resolve()
    fireOnline()
    vi.advanceTimersByTime(ONLINE_SYNC_DEBOUNCE_MS)
    expect(store.$sync).toHaveBeenCalledTimes(2)
  })

  it('does not stack listeners when the store is recreated', async () => {
    const oldStore = { $sync: vi.fn(async () => {}) }
    const newStore = { $sync: vi.fn(async () => {}) }
    await install(oldStore)
    await install(newStore)

    expect(onlineListeners.size).toBe(1)

    fireOnline()
    vi.advanceTimersByTime(ONLINE_SYNC_DEBOUNCE_MS)

    // Only the most recent store syncs; the replaced one is dropped.
    expect(newStore.$sync).toHaveBeenCalledTimes(1)
    expect(oldStore.$sync).not.toHaveBeenCalled()
  })
})
