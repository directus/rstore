import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { stubWindow } from '#test-utils/store/windowStub'
import { afterEach, describe, expect, it, vi } from 'vitest'

// `store.spec.ts` covers `$sync` persistence and its re-entrancy guard. The
// progress protocol — what a sync UI actually binds to — was untouched:
// `sync.ts:56` splits each callback's percent by `callbacks.length`, and the
// loaded/synced collection sets are reset at the *start* of a run so a UI
// never shows the previous run's collections while a new one is in flight.

/** A sync callback, as a plugin would register it. */
type SyncCallback = (payload: any) => unknown

/**
 * Core store whose `sync` hooks come from a plugin.
 *
 * Registering through a plugin (rather than `store.$hooks.hook` afterwards) is
 * what makes the callbacks visible to the `syncImmediately` run that
 * `createStoreCore` fires before it returns.
 *
 * @param callbacks Sync callbacks, in registration order.
 * @param syncImmediately Runs one sync during store creation.
 */
async function setup(callbacks: SyncCallback[], syncImmediately = false) {
  const plugin: Plugin = {
    name: 'sync-source',
    setup({ hook }: any) {
      for (const callback of callbacks) {
        hook('sync', callback)
      }
    },
  }
  const { store } = await createCoreStack({
    schema: [{ name: 'todos' }],
    remote: false,
    plugins: [plugin],
    syncImmediately,
  })
  return { store }
}

describe('sync progress', () => {
  it('passes caller cancellation to sync hooks', async () => {
    const signal = new AbortController().signal
    let received: AbortSignal | undefined
    const { store } = await setup([
      (payload: any) => {
        received = payload.signal
      },
    ])

    await store.$sync({ signal })

    expect(received).toBe(signal)
  })

  it('advances one slice per callback and reports partial progress inside one', async () => {
    const seen: Record<string, number | undefined> = {}

    const { store } = await setup([
      ({ store }: any) => {
        seen.enter1 = store.$syncState.progress
      },
      ({ store, setProgress }: any) => {
        seen.enter2 = store.$syncState.progress
        setProgress({ percent: 0.5, message: 'halfway through the second step' })
        seen.mid2 = store.$syncState.progress
      },
      ({ store }: any) => {
        seen.enter3 = store.$syncState.progress
      },
    ])

    await store.$sync()

    // Nothing has run yet, so no progress has been published at all.
    expect(seen.enter1).toBeUndefined()
    expect(seen.enter2).toBeCloseTo(1 / 3)
    expect(seen.enter3).toBeCloseTo(2 / 3)
    expect(store.$syncState.progress).toBeCloseTo(1)

    // A `setProgress` inside a callback must stay inside that callback's own
    // slice, or a progress bar jumps past work that has not happened.
    expect(seen.mid2!).toBeGreaterThan(seen.enter2!)
    expect(seen.mid2!).toBeLessThan(seen.enter3!)
    expect(seen.mid2).toBeCloseTo(0.5)
  })

  it('keeps the last `setProgress` message', async () => {
    const { store } = await setup([
      ({ setProgress }: any) => setProgress({ percent: 1, message: 'first' }),
      ({ setProgress }: any) => setProgress({ percent: 1, message: 'second' }),
    ])

    await store.$sync()

    expect(store.$syncState.progressMessage).toBe('second')
  })
})

describe('sync collection sets', () => {
  it('collects loaded and synced collections and clears them at the start of the next run', async () => {
    const atEntry: Array<{ loaded: string[], synced: string[] }> = []

    const { store } = await setup([
      ({ store, setCollectionLoaded, setCollectionSynced }: any) => {
        atEntry.push({
          loaded: [...store.$syncState.loadedCollections],
          synced: [...store.$syncState.syncedCollections],
        })
        setCollectionLoaded('todos')
        setCollectionSynced('todos')
      },
    ])

    await store.$sync()

    expect([...store.$syncState.loadedCollections]).toEqual(['todos'])
    expect([...store.$syncState.syncedCollections]).toEqual(['todos'])

    await store.$sync()

    // Clearing at the start, not the end, is what lets a UI keep showing what
    // the last run covered until the next one actually starts producing.
    expect(atEntry).toEqual([
      { loaded: [], synced: [] },
      { loaded: [], synced: [] },
    ])
    expect([...store.$syncState.loadedCollections]).toEqual(['todos'])
  })
})

describe('sync failure', () => {
  let restore: (() => void) | undefined

  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('records the error, settles, persists nothing, and recovers on the next run', async () => {
    const stub = stubWindow()
    restore = stub.restore

    let shouldFail = true
    const { store } = await setup([
      () => {
        if (shouldFail) {
          throw new Error('sync source unreachable')
        }
      },
    ])

    await store.$sync()

    expect(store.$syncState.error).toBeInstanceOf(Error)
    expect(store.$syncState.error!.message).toBe('sync source unreachable')
    expect(store.$syncState.isSyncing).toBe(false)
    // A failed run must not look like a successful one: `lastSyncAt` is what a
    // later run compares against to decide what to fetch, and persisting it
    // would make the app skip the data the failed run never got.
    expect(store.$syncState.lastSyncAt).toBeUndefined()
    expect(stub.storage.get('rstore-last-sync-at')).toBeUndefined()

    shouldFail = false
    await store.$sync()

    expect(store.$syncState.error).toBeUndefined()
    expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
    expect(stub.storage.get('rstore-last-sync-at')).toBe(store.$syncState.lastSyncAt!.toISOString())
  })
})

describe('syncImmediately', () => {
  it('runs exactly one sync during store creation', async () => {
    let calls = 0
    const { store } = await setup([
      async () => {
        calls++
        await Promise.resolve()
      },
    ], true)

    // The callback already ran: the sync starts inside `createStoreCore`, not
    // on first use. It is not awaited there, so a caller needing a settled
    // state waits for one — and no second run is started meanwhile.
    expect(calls).toBe(1)

    await vi.waitFor(() => expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date))

    expect(calls).toBe(1)
    expect(store.$syncState.isSyncing).toBe(false)
  })

  it('runs no sync when disabled', async () => {
    let calls = 0
    const { store } = await setup([() => {
      calls++
    }], false)

    expect(calls).toBe(0)
    expect(store.$syncState.lastSyncAt).toBeUndefined()
  })
})
