import { vi } from 'vitest'

/**
 * `window` global stub, kept apart from `vueApp.ts` on purpose.
 *
 * `packages/core/test/store.spec.ts` needs it and runs in the `unit` layer,
 * which `packages/core/tsconfig.json` type-checks. Importing it from
 * `vueApp.ts` would drag `packages/vue/src/plugin` — and the whole `@rstore/vue`
 * source tree — into the core package's `tsc` run, where it does not
 * type-check. This file imports nothing from the packages.
 */

/** An `EventTarget`-backed `window` stub with a `localStorage`. */
export interface WindowStub {
  /** The object installed as the `window` global. */
  window: EventTarget & { localStorage: Storage }
  /** The map backing `window.localStorage`, for direct assertions. */
  storage: Map<string, string>
  /** Dispatches an event on the stub, e.g. `focus` for SWR auto-refresh. */
  dispatch: (type: string) => void
  /** Removes the stub and every other global stubbed by the test. */
  restore: () => void
}

/**
 * Installs a `window` global backed by an `EventTarget`.
 *
 * Covers both consumers: `swr.ts` needs `addEventListener('focus')` and
 * `core/src/sync.ts` needs `localStorage`. Call {@link WindowStub.restore} in
 * an `afterEach`, since `swr.ts` caches the target it bound to.
 */
export function stubWindow(): WindowStub {
  const storage = new Map<string, string>()
  const target = new EventTarget() as EventTarget & { localStorage: Storage }

  target.localStorage = {
    get length() {
      return storage.size
    },
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value))
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
  } satisfies Storage

  vi.stubGlobal('window', target)

  return {
    window: target,
    storage,
    dispatch: type => target.dispatchEvent(new Event(type)),
    restore: () => vi.unstubAllGlobals(),
  }
}
