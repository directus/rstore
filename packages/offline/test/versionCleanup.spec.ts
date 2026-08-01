import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installVersionCleanupHook } from '../src/plugin/versionCleanup'
import { createCollection, createFakeStore, createHookCollector, createRuntime, stubLocalStorage } from './utils/plugin'

// Bumping the storage `version` wipes the local IndexedDB stores. The
// per-collection sync metadata must be wiped with them: it survives in
// localStorage, and a stale `lastUpdatedAt` would make the next delta sync
// skip re-downloading the very rows that were just deleted.

describe('offline storage version cleanup', () => {
  let collector: ReturnType<typeof createHookCollector>
  let localStorageBacking: Map<string, string>
  let store: any
  let warn: ReturnType<typeof vi.spyOn>

  const metadataKey = 'rstore-offline-metadata-Todos'

  beforeEach(() => {
    localStorageBacking = stubLocalStorage()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as any
    collector = createHookCollector()
    store = createFakeStore([createCollection()])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    warn.mockRestore()
  })

  /** Creates a runtime seeded with local rows and per-collection metadata. */
  function setup(options: Record<string, any>, storedVersion: number | null = 1) {
    const created = createRuntime({
      options,
      globalMetadata: storedVersion == null ? null : { version: storedVersion },
    })
    created.db.stores.set('Todos', new Map([['1', { id: '1' }]]))
    localStorageBacking.set(metadataKey, JSON.stringify({ updatedAt: 123 }))
    installVersionCleanupHook(created.runtime, collector.hook)
    return created
  }

  it('clears collection stores and their sync metadata on version change', async () => {
    const { db } = setup({ version: 2 })

    await collector.run('init', { store })

    expect(db.clearDatabase).toHaveBeenCalledWith('Todos')
    expect(db.stores.get('Todos')!.size).toBe(0)
    expect(localStorageBacking.has(metadataKey)).toBe(false)
  })

  it('keeps the ops queue by default but warns about it', async () => {
    const { runtime, db } = setup({ version: 2 })
    db.stores.set(runtime.opsStoreName, new Map([['op-1', { id: 'op-1' }]]))

    await collector.run('init', { store })

    // Queued mutations are user data: dropping them silently is worse than
    // replaying them against the new schema.
    expect(db.stores.get(runtime.opsStoreName)!.size).toBe(1)
    expect(warn).toHaveBeenCalled()
  })

  it('clears the ops queue when clearQueueOnVersionChange is set', async () => {
    const { runtime, db } = setup({ version: 2, clearQueueOnVersionChange: true })
    db.stores.set(runtime.opsStoreName, new Map([['op-1', { id: 'op-1' }]]))

    await collector.run('init', { store })

    expect(db.stores.get(runtime.opsStoreName)!.size).toBe(0)
    expect(warn).not.toHaveBeenCalled()
  })

  it('does nothing when the version matches', async () => {
    const { db } = setup({ version: 2 }, 2)

    await collector.run('init', { store })

    expect(db.clearDatabase).not.toHaveBeenCalled()
    expect(localStorageBacking.has(metadataKey)).toBe(true)
  })

  it('does nothing when no version option is set', async () => {
    const { db } = setup({})

    await collector.run('init', { store })

    expect(db.clearDatabase).not.toHaveBeenCalled()
    expect(localStorageBacking.has(metadataKey)).toBe(true)
  })
})
