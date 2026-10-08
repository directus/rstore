import { vi } from 'vitest'

/** Storage boundary used by Core timestamp persistence scenarios. */
export interface BrowserStorageStub {
  /** Persisted key/value data shared by successive real stores. */
  storage: Map<string, string>
  /** Restore the global dependency after the persistence scenario. */
  restore: () => void
}

/** Supply a stateful Storage double through Core's browser persistence seam. */
export function stubBrowserStorage(): BrowserStorageStub {
  const storage = new Map<string, string>()
  const localStorage = {
    /** Number of persisted entries. */
    get length() {
      return storage.size
    },
    /** Read the same missing-key shape as native Storage. */
    getItem: (key: string) => storage.get(key) ?? null,
    /** Persist string values for subsequent store restoration. */
    setItem: (key: string, value: string) => {
      storage.set(key, String(value))
    },
    /** Remove the selected persisted entry. */
    removeItem: (key: string) => {
      storage.delete(key)
    },
    /** Clear this isolated persistence namespace. */
    clear: () => storage.clear(),
    /** Enumerate persisted keys using the Storage API. */
    key: (index: number) => [...storage.keys()][index] ?? null,
  } satisfies Storage

  // Only persistence is substituted; Core synchronization and store state stay real.
  vi.stubGlobal('window', { localStorage })
  return { storage, restore: () => vi.unstubAllGlobals() }
}
